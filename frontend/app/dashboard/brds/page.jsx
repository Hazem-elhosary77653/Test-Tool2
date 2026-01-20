"use client";

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useProjectStore } from '@/store';
import api from '@/lib/api';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';
import WorkflowPanel from './components/WorkflowPanel';
import CollaboratorsPanel from './components/CollaboratorsPanel';
import ActivityLog from './components/ActivityLog';
import Comments from './components/Comments';
import MermaidViewer from '@/components/MermaidViewer';
import {
  Edit2, Trash2, Sparkles, Search, FileText, Download,
  Eye, Clock, ChevronDown, ChevronUp, RefreshCw, Copy, Check,
  AlertCircle, History, FileDown, Share2, Users,
  ShieldCheck, Zap, GitCompare, BookOpen, Layout, MessageSquare, GitBranch
} from 'lucide-react';

export default function BRDsPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Refs
  const contentRef = useRef(null);

  // State
  const [brds, setBRDs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [expandedBRD, setExpandedBRD] = useState(null);
  const [openExportId, setOpenExportId] = useState(null);
  const { activeGroupId, activeGroupName, setActiveProject } = useProjectStore();
  const [userGroups, setUserGroups] = useState([]);

  // Status messages
  const [status, setStatus] = useState(null);
  const [brdDiagrams, setBrdDiagrams] = useState([]);
  const [loadingDiagrams, setLoadingDiagrams] = useState(false);

  // Derived: filter and sort BRDs for listing
  const filteredBRDs = useMemo(() => {
    let list = Array.isArray(brds) ? [...brds] : [];
    const term = (searchTerm || '').trim().toLowerCase();
    if (term) {
      list = list.filter(b => (b.title || '').toLowerCase().includes(term) || (b.content || '').toLowerCase().includes(term));
    }
    if (filterStatus && filterStatus !== 'all') {
      list = list.filter(b => (b.status || 'draft') === filterStatus);
    }
    switch (sortBy) {
      case 'date-asc':
        list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case 'title':
        list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'version':
        list.sort((a, b) => (b.version || 0) - (a.version || 0));
        break;
      case 'date-desc':
      default:
        list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
    }
    return list;
  }, [brds, searchTerm, filterStatus, sortBy]);

  const filteredByGroup = useMemo(() => {
    if (!activeGroupId || activeGroupId === 'all') return filteredBRDs;
    return filteredBRDs.filter(b => String(b.group_id) === String(activeGroupId));
  }, [filteredBRDs, activeGroupId]);

  const [viewModal, setViewModal] = useState({ open: false, brd: null, activeTab: 'workflow' });
  const [editModal, setEditModal] = useState({ open: false, brd: null });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, brdId: null });
  const [versionsModal, setVersionsModal] = useState({ open: false, brdId: null, versions: [] });
  const [compareModal, setCompareModal] = useState({ open: false, v1: null, v2: null, content1: '', content2: '', mode: 'side' });
  // Inline highlights in content tab (vs previous version)
  const [inlineHL, setInlineHL] = useState({ enabled: false, loading: false, prevContent: '' });

  // Side-by-side diff to highlight version changes per line
  const diffView = useMemo(() => {
    const a = (compareModal.content1 || '').split(/\r?\n/);
    const b = (compareModal.content2 || '').split(/\r?\n/);
    const max = Math.max(a.length, b.length);
    const left = [];
    const right = [];
    for (let i = 0; i < max; i++) {
      const al = a[i] ?? '';
      const bl = b[i] ?? '';
      let status = 'same';
      if (al === bl) status = 'same';
      else if (al && !bl) status = 'removed';
      else if (!al && bl) status = 'added';
      else status = 'changed';
      left.push({ text: al, status });
      right.push({ text: bl, status });
    }
    return { left, right };
  }, [compareModal.content1, compareModal.content2]);

  // Derived: extract markdown headings for a simple Table of Contents
  const contentHeadings = useMemo(() => {
    const content = viewModal.brd?.content || '';
    const lines = content.split(/\r?\n/);
    const headings = [];
    for (let i = 0; i < lines.length; i++) {
      const m = /^(#{1,6})\s+(.+)$/.exec(lines[i]);
      if (m) {
        const level = m[1].length;
        const text = m[2].trim();
        const id = text
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-');
        headings.push({ level, text, id, line: i });
      }
    }
    return headings;
  }, [viewModal.brd?.content]);

  // Parse content into simple blocks with heading anchors
  const contentBlocks = useMemo(() => {
    const src = viewModal.brd?.content || '';
    const lines = src.split(/\r?\n/);
    const blocks = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = /^(#{1,6})\s+(.+)$/.exec(line);
      if (m) {
        const level = m[1].length;
        const text = m[2].trim();
        const id = text
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-');
        blocks.push({ type: 'heading', level, text, id, line: i });
      } else {
        blocks.push({ type: 'text', text: line, line: i });
      }
    }
    return blocks;
  }, [viewModal.brd?.content]);

  // Compute per-line inline statuses against previous version
  const inlineStatuses = useMemo(() => {
    if (!inlineHL.enabled || !inlineHL.prevContent) return null;
    const prev = inlineHL.prevContent.split(/\r?\n/);
    const curr = (viewModal.brd?.content || '').split(/\r?\n/);
    const max = curr.length;
    const arr = new Array(max);
    for (let i = 0; i < max; i++) {
      const a = prev[i] ?? '';
      const b = curr[i] ?? '';
      let s = 'same';
      if (a === b) s = 'same';
      else if (!a && b) s = 'added';
      else s = 'changed';
      arr[i] = s;
    }
    return arr;
  }, [inlineHL.enabled, inlineHL.prevContent, viewModal.brd?.content]);

  // Compute section-level change status for ToC badges
  const sectionStatuses = useMemo(() => {
    if (!inlineStatuses || !contentHeadings.length) return {};
    const statuses = {};
    for (let i = 0; i < contentHeadings.length; i++) {
      const heading = contentHeadings[i];
      const nextHeading = contentHeadings[i + 1];
      const startLine = heading.line;
      const endLine = nextHeading ? nextHeading.line - 1 : inlineStatuses.length - 1;
      let hasChanges = false;
      let hasAdded = false;
      for (let line = startLine; line <= endLine && line < inlineStatuses.length; line++) {
        const status = inlineStatuses[line];
        if (status === 'added') hasAdded = true;
        if (status === 'changed' || status === 'added') hasChanges = true;
      }
      statuses[heading.id] = hasAdded ? 'added' : hasChanges ? 'changed' : 'same';
    }
    return statuses;
  }, [inlineStatuses, contentHeadings]);

  // Scroll to a specific heading by anchor id inside the content viewer
  const scrollToHeading = (anchorId) => {
    try {
      // Find the scrollable container first
      const scrollContainer = document.querySelector('[data-content-scroll]');
      const target = document.querySelector(`[data-anchor-id="${anchorId}"]`);
      if (!scrollContainer || !target) return;
      // Calculate offset relative to the scroll container
      const containerRect = scrollContainer.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offset = targetRect.top - containerRect.top + scrollContainer.scrollTop - 20;
      scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
    } catch { }
  };

  const fetchPreviousVersionContent = async (brdId, currentVersion) => {
    try {
      const listRes = await api.get(`brd/${brdId}/versions`);
      const versions = listRes.data?.data || [];
      const nums = versions.map(v => Number(v.version_number)).filter(n => !Number.isNaN(n));
      const prev = Math.max(...nums.filter(n => n < Number(currentVersion)));
      if (!Number.isFinite(prev)) return null;
      const contentRes = await api.get(`brd/${brdId}/versions/${prev}`);
      return contentRes.data?.data?.content || '';
    } catch (e) {
      console.error('Load previous version failed', e);
      return null;
    }
  };

  const toggleInlineHighlight = async () => {
    if (inlineHL.enabled) {
      setInlineHL(p => ({ ...p, enabled: false }));
      return;
    }
    if (inlineHL.prevContent) {
      setInlineHL(p => ({ ...p, enabled: true }));
      return;
    }
    try {
      setInlineHL(p => ({ ...p, loading: true }));
      const prev = await fetchPreviousVersionContent(viewModal.brd?.id, viewModal.brd?.version || viewModal.brd?.version_number || 1);
      if (!prev) {
        setInlineHL({ enabled: false, loading: false, prevContent: '' });
        setStatus({ type: 'info', message: 'No previous version to highlight' });
        return;
      }
      setInlineHL({ enabled: true, loading: false, prevContent: prev });
    } catch (e) {
      setInlineHL({ enabled: false, loading: false, prevContent: '' });
      setStatus({ type: 'error', message: 'Failed to load previous version' });
    }
  };

  // Utilities
  const formatDate = (d) => new Date(d).toLocaleString();

  // Utilities and data
  const fetchBRDs = async () => {
    try {
      setLoading(true);
      const res = await api.get('brd');
      setBRDs(res.data?.data || []);
    } catch (err) {
      console.error('Error fetching BRDs:', err);
      setStatus({ type: 'error', message: 'Failed to load BRDs' });
    } finally {
      setLoading(false);
    }
  };
  const fetchBrdDiagrams = async (brdId) => {
    try {
      setLoadingDiagrams(true);
      const res = await api.get(`/diagrams/brd/${brdId}`);
      setBrdDiagrams(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch BRD diagrams:', err);
    } finally {
      setLoadingDiagrams(false);
    }
  };

  useEffect(() => {
    if (viewModal.open && viewModal.brd?.id) {
      if (viewModal.activeTab === 'diagrams') {
        fetchBrdDiagrams(viewModal.brd.id);
      }
    }
  }, [viewModal.open, viewModal.activeTab, viewModal.brd?.id]);

  const loadGroups = async () => {
    try {
      const res = await api.get('/groups/my-groups');
      const groups = res.data?.data || [];
      setUserGroups(groups);
      if (groups.length > 0 && !activeGroupId) {
        setActiveProject(groups[0].id, groups[0].name);
      }
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  };

  useEffect(() => {
    fetchBRDs();
    loadGroups();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Escape = Close modals
      if (e.key === 'Escape') {
        if (viewModal.open) setViewModal(prev => ({ ...prev, open: false }));
        if (compareModal.open) setCompareModal(prev => ({ ...prev, open: false }));
        if (versionsModal.open) setVersionsModal(prev => ({ ...prev, open: false }));
        if (deleteConfirm.open) setDeleteConfirm({ open: false, brdId: null });
      }
      // Ctrl/Cmd + N = New BRD
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !viewModal.open) {
        e.preventDefault();
        router.push('/dashboard/brds/create');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewModal.open, compareModal.open, versionsModal.open, deleteConfirm.open, router]);

  const handleDeleteBRD = async () => {
    try {
      if (!deleteConfirm.brdId) return;
      await api.delete(`brd/${deleteConfirm.brdId}`);
      setBRDs(prev => prev.filter(b => b.id !== deleteConfirm.brdId));
      setStatus({ type: 'success', message: 'BRD deleted successfully!' });
    } catch (err) {
      console.error('Error deleting BRD:', err);
      setStatus({ type: 'error', message: 'Failed to delete BRD' });
    } finally {
      setDeleteConfirm({ open: false, brdId: null });
    }
  };

  const handleExportPDF = async (brdId) => {
    try {
      setStatus({ type: 'info', message: 'Generating PDF with ToC...' });
      const response = await api.post(`brd/${brdId}/export-pdf`, {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `BRD_${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus({ type: 'success', message: 'PDF with Table of Contents downloaded!' });
    } catch (err) {
      console.error('Error exporting PDF:', err);
      setStatus({ type: 'error', message: 'Failed to export PDF' });
    }
  };

  const handleExportExcel = async (brdId) => {
    try {
      setStatus({ type: 'info', message: 'Generating Structured Excel...' });
      const response = await api.post(`brd/${brdId}/export-excel`, {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `BRD_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus({ type: 'success', message: 'Structured Excel downloaded!' });
    } catch (err) {
      console.error('Error exporting Excel:', err);
      setStatus({ type: 'error', message: 'Failed to export Excel' });
    }
  };

  const handleExportDOCX = async (brdId) => {
    try {
      setStatus({ type: 'info', message: 'Generating DOCX with ToC...' });
      const response = await api.post(`brd/${brdId}/export-docx`, {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `BRD_${Date.now()}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus({ type: 'success', message: 'DOCX with Table of Contents downloaded!' });
    } catch (err) {
      console.error('Error exporting DOCX:', err);
      setStatus({ type: 'error', message: 'Failed to export DOCX' });
    }
  };

  const handleExportText = async (brdId) => {
    try {
      const response = await api.get(`brd/${brdId}/export-text`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a'); link.href = url; link.setAttribute('download', `BRD_${Date.now()}.txt`);
      document.body.appendChild(link); link.click(); link.remove();
      setStatus({ type: 'success', message: 'Text file downloaded!' });
    } catch (err) { console.error('Error exporting text:', err); setStatus({ type: 'error', message: 'Failed to export text' }); }
  };

  const handleViewVersions = async (brdId) => {
    try { const response = await api.get(`brd/${brdId}/versions`); setVersionsModal({ open: true, brdId, versions: response.data?.data || [] }); }
    catch (err) { console.error('Error fetching versions:', err); setStatus({ type: 'error', message: 'Failed to load version history' }); }
  };
  const handleFetchVersionForCompare = async (brdId, version, slot) => {
    try {
      const response = await api.get(`brd/${brdId}/versions/${version}`);
      if (slot === 1) setCompareModal(p => ({ ...p, v1: version, content1: response.data?.data?.content || '' }));
      else setCompareModal(p => ({ ...p, v2: version, content2: response.data?.data?.content || '' }));
    } catch (err) { console.error('Error loading version content:', err); }
  };

  // Quick compare: open current version against previous one automatically
  const handleQuickComparePrevious = async (brdId, currentVersion) => {
    try {
      if (!versionsModal.versions?.length) return;
      const nums = versionsModal.versions
        .map(v => Number(v.version_number))
        .filter(n => !Number.isNaN(n));
      const prev = Math.max(...nums.filter(n => n < Number(currentVersion)));
      if (!Number.isFinite(prev)) {
        setStatus({ type: 'info', message: 'No previous version to compare' });
        return;
      }
      // Reset and fetch
      setCompareModal({ open: false, v1: null, v2: null, content1: '', content2: '', mode: 'side' });
      await handleFetchVersionForCompare(brdId, prev, 1);
      await handleFetchVersionForCompare(brdId, currentVersion, 2);
      setCompareModal(p => ({ ...p, open: true }));
    } catch (e) {
      console.error('Quick compare failed', e);
    }
  };

  const [analysisModal, setAnalysisModal] = useState({ open: false, data: null, loading: false });
  const handleAnalyzeBRD = async (brdId) => {
    try {
      setAnalysisModal({ open: true, data: null, loading: true });
      const response = await api.get(`brd/${brdId}/analyze`);
      setAnalysisModal({ open: true, data: response.data?.data || null, loading: false });
    } catch (err) {
      console.error('Error analyzing BRD:', err);
      setAnalysisModal({ open: true, data: null, loading: false });
      setStatus({ type: 'error', message: 'Failed to analyze BRD' });
    }
  };

  const [editForm, setEditForm] = useState({ title: '', content: '', group_id: '' });
  const [saving, setSaving] = useState(false);
  const openEditModal = (brd) => {
    if (brd?.status === 'approved') {
      setStatus({ type: 'info', message: 'Approved protocols cannot be modified' });
      return;
    }

    const canEdit = brd?.user_permission === 'owner' || brd?.user_permission === 'edit' || user?.role === 'admin';
    if (!canEdit) {
      setStatus({ type: 'error', message: 'You do not have permission to edit this protocol' });
      return;
    }

    setEditForm({ title: brd?.title || '', content: brd?.content || '', group_id: brd?.group_id || '' });
    setEditModal({ open: true, brd });
  };
  const handleUpdateBRD = async () => {
    try { if (!editModal.brd?.id) return; setSaving(true); await api.put(`brd/${editModal.brd.id}`, { title: editForm.title, content: editForm.content, group_id: editForm.group_id }); setStatus({ type: 'success', message: 'BRD updated' }); setEditModal({ open: false, brd: null }); fetchBRDs(); }
    catch (err) { console.error('Error updating BRD:', err); setStatus({ type: 'error', message: 'Failed to update BRD' }); }
    finally { setSaving(false); }
  };

  const [extracting, setExtracting] = useState(false);
  const handleExtractStories = async (brdId) => {
    try {
      setExtracting(true);
      setStatus({ type: 'info', message: 'Extracting user stories from BRD...' });
      const response = await api.post(`brd/${brdId}/convert-to-stories`, {});
      const count = response.data?.data?.length || 0;
      setStatus({ type: 'success', message: `Successfully extracted ${count} user stories!` });
    } catch (err) {
      console.error('Error extracting stories:', err);
      const errorMsg = err.response?.data?.error || 'Failed to extract stories';
      setStatus({ type: 'error', message: errorMsg });
    } finally {
      setExtracting(false);
    }
  };

  const handleShareBRD = (brd) => {
    try { const url = `${window.location.origin}/share/${brd?.id}`; navigator.clipboard.writeText(url); setStatus({ type: 'success', message: 'Share link copied' }); }
    catch { setStatus({ type: 'error', message: 'Failed to copy share link' }); }
  };



  const copyToClipboard = async (text) => {
    try { await navigator.clipboard.writeText(text || ''); setStatus({ type: 'success', message: 'Copied to clipboard' }); }
    catch { setStatus({ type: 'error', message: 'Copy failed' }); }
  };

  return (
    <div className="flex h-screen bg-gray-50 text-[13px] md:text-[14px]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-purple-600 rounded-lg">
                    <FileText size={24} className="text-white" />
                  </div>
                  <h1 className="text-3xl font-bold text-gray-900">Business Requirements Documents</h1>
                </div>
                <p className="text-gray-600 ml-11">Generate, edit, and manage BRDs with AI-powered assistance.</p>
              </div>

              <div className="flex items-center gap-4 bg-white p-2 rounded-xl shadow-sm border border-gray-200">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter ml-1">Active Project</span>
                  <select
                    className="bg-transparent border-none text-sm font-semibold text-indigo-900 focus:outline-none cursor-pointer"
                    value={activeGroupId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const name = userGroups.find(g => String(g.id) === String(id))?.name || 'All Projects';
                      setActiveProject(id, name);
                    }}
                  >
                    <option value="all">All Projects</option>
                    {userGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={fetchBRDs}
                  className="btn flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-all"
                  disabled={loading}
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </button>

                <button
                  onClick={() => router.push('/dashboard/brds/create')}
                  className="btn flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg"
                >
                  <Sparkles size={20} />
                  Generate BRD
                </button>
              </div>
            </div>

            {/* Status Messages */}
            {status && (
              <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-[9999] p-4 rounded-lg border-l-4 text-sm font-medium transition-all duration-300 shadow-2xl max-w-md ${status.type === 'error'
                ? 'border-l-red-500 bg-red-50 text-red-700 border border-red-200'
                : status.type === 'info'
                  ? 'border-l-blue-500 bg-blue-50 text-blue-700 border border-blue-200'
                  : 'border-l-green-500 bg-green-50 text-green-700 border border-green-200'
                }`}>
                <div className="flex items-start gap-3">
                  {status.type === 'error' ? (
                    <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                  ) : status.type === 'info' ? (
                    <Sparkles size={20} className="flex-shrink-0 mt-0.5 animate-pulse" />
                  ) : (
                    <Check size={20} className="flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">{status.message}</div>
                </div>
              </div>
            )}

            {/* Search and Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search BRDs by title or content..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                  />
                </div>

                <div className="flex gap-3">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white"
                  >
                    <option value="all">All Status</option>
                    <option value="draft">Draft</option>
                    <option value="review">In Review</option>
                    <option value="approved">Approved</option>
                  </select>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white"
                  >
                    <option value="date-desc">Newest First</option>
                    <option value="date-asc">Oldest First</option>
                    <option value="title">By Title</option>
                    <option value="version">By Version</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Total BRDs</p>
                <p className="text-2xl font-bold text-gray-900">{brds.length}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Draft</p>
                <p className="text-2xl font-bold text-yellow-600">{brds.filter(b => b.status === 'draft').length}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">In Review</p>
                <p className="text-2xl font-bold text-blue-600">{brds.filter(b => b.status === 'review').length}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Approved</p>
                <p className="text-2xl font-bold text-green-600">{brds.filter(b => b.status === 'approved').length}</p>
              </div>
            </div>

            {/* BRD List */}
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="animate-spin h-12 w-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading BRDs...</p>
                </div>
              </div>
            ) : filteredByGroup.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <div className="p-4 bg-purple-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <FileText size={32} className="text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {searchTerm ? 'No BRDs found' : 'No BRDs yet'}
                </h3>
                <p className="text-gray-500 mb-6">
                  {searchTerm ? 'Try a different search term' : 'Generate your first BRD from user stories'}
                </p>
                {!searchTerm && (
                  <button
                    onClick={() => router.push('/dashboard/brds/create')}
                    className="btn inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-all"
                  >
                    <Sparkles size={20} />
                    Generate First BRD
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredByGroup.map((brd) => (
                  <div
                    key={brd.id}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-all"
                  >
                    {/* Card Header */}
                    <div
                      className="p-5 cursor-pointer"
                      onClick={() => setExpandedBRD(expandedBRD === brd.id ? null : brd.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-bold text-gray-900">{brd.title}</h3>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              v{brd.version || 1}
                            </span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${brd.status === 'approved' ? 'bg-green-100 text-green-700' :
                              brd.status === 'review' ? 'bg-blue-100 text-blue-700' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>
                              {brd.status || 'draft'}
                            </span>
                            {brd.user_permission && (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${brd.user_permission === 'owner' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {brd.user_permission}
                              </span>
                            )}
                          </div>
                          <p className="text-gray-600 text-sm line-clamp-2 mb-3">{brd.content?.substring(0, 200)}...</p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock size={14} />
                              Created: {formatDate(brd.created_at)}
                            </span>
                            {brd.updated_at && brd.updated_at !== brd.created_at && (
                              <span className="flex items-center gap-1">
                                <Edit2 size={14} />
                                Updated: {formatDate(brd.updated_at)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewModal({ open: true, brd, activeTab: 'workflow' }); }}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="View"
                          >
                            <Eye size={18} className="text-gray-600" />
                          </button>
                          {brd.status !== 'approved' && (brd.user_permission === 'owner' || brd.user_permission === 'edit' || user?.role === 'admin') && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditModal(brd); }}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={18} className="text-gray-600" />
                            </button>
                          )}
                          <div className="relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setOpenExportId(openExportId === brd.id ? null : brd.id); }}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1 group"
                              title="Export Protocol"
                            >
                              <Download size={18} className="text-gray-600 group-hover:text-indigo-600" />
                              <ChevronDown size={14} className={`text-gray-400 transition-transform ${openExportId === brd.id ? 'rotate-180' : ''}`} />
                            </button>
                            {openExportId === brd.id && (
                              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleExportPDF(brd.id); setOpenExportId(null); }}
                                  className="w-full text-left px-4 py-3 text-[11px] font-black uppercase tracking-tight text-slate-700 hover:bg-red-50 flex items-center gap-3 transition-colors"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0"><Download size={14} /></div>
                                  Aesthetics PDF
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleExportExcel(brd.id); setOpenExportId(null); }}
                                  className="w-full text-left px-4 py-3 text-[11px] font-black uppercase tracking-tight text-slate-700 hover:bg-emerald-50 flex items-center gap-3 transition-colors"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Layout size={14} /></div>
                                  Structured Excel
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleExportDOCX(brd.id); setOpenExportId(null); }}
                                  className="w-full text-left px-4 py-3 text-[11px] font-black uppercase tracking-tight text-slate-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><FileText size={14} /></div>
                                  Microsoft Word
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleExportText(brd.id); setOpenExportId(null); }}
                                  className="w-full text-left px-4 py-3 text-[11px] font-black uppercase tracking-tight text-slate-700 hover:bg-slate-100 flex items-center gap-3 transition-colors"
                                >
                                  <div className="w-6 h-6 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center shrink-0"><FileDown size={14} /></div>
                                  Protocol Source
                                </button>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleViewVersions(brd.id); }}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Version History"
                          >
                            <History size={18} className="text-gray-600" />
                          </button>
                          {(brd.user_permission === 'owner' || user?.role === 'admin') && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ open: true, brdId: brd.id }); }}
                              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                              title="Purge Protocol"
                            >
                              <Trash2 size={18} className="text-red-400" />
                            </button>
                          )}
                          <div className="ml-2">
                            {expandedBRD === brd.id ? (
                              <ChevronUp size={20} className="text-gray-400" />
                            ) : (
                              <ChevronDown size={20} className="text-gray-400" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {expandedBRD === brd.id && (
                      <div className="border-t border-gray-200 p-5 bg-gray-50">
                        <div className="prose prose-sm max-w-none">
                          <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-white p-4 rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
                            {brd.content}
                          </pre>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => copyToClipboard(brd.content)}
                            className="btn flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 text-sm"
                          >
                            <Copy size={16} />
                            Copy Content
                          </button>
                          <button
                            onClick={() => handleExportText(brd.id)}
                            className="btn flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 text-sm"
                          >
                            <FileDown size={16} />
                            Export as Text
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <Modal
        isOpen={viewModal.open}
        onClose={() => setViewModal({ open: false, brd: null, activeTab: 'workflow' })}
        title={
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-600 rounded-lg text-white">
              <BookOpen size={14} />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-slate-800">{viewModal.brd?.title || 'Document Viewer'}</h2>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span>v{viewModal.brd?.version || 1}</span>
                <span>•</span>
                <span className={viewModal.brd?.status === 'approved' ? 'text-emerald-600' : viewModal.brd?.status === 'review' ? 'text-amber-600' : ''}>
                  {viewModal.brd?.status || 'draft'}
                </span>
              </div>
            </div>
          </div>
        }
        size="4xl"
      >
        <div className="flex flex-col gap-2 h-[70vh] w-full text-[12px]">
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200/50 overflow-x-auto scrollbar-hide no-scrollbar">
            {[
              { id: 'content', label: 'Protocol', icon: BookOpen },
              { id: 'analysis', label: 'Analysis', icon: Sparkles },
              { id: 'diagrams', label: 'Diagrams', icon: GitBranch },
              { id: 'workflow', label: 'Approval', icon: ShieldCheck },
              { id: 'collaborators', label: 'Team', icon: Users },
              { id: 'activity', label: 'Activity', icon: Clock },
              { id: 'comments', label: 'Comments', icon: MessageSquare }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setViewModal(prev => ({ ...prev, activeTab: tab.id }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap shrink-0 ${viewModal.activeTab === tab.id
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                  }`}
              >
                <tab.icon size={12} className={viewModal.activeTab === tab.id ? 'text-indigo-500' : 'text-slate-400'} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {viewModal.activeTab === 'content' && (
              <div data-content-scroll className="flex-1 overflow-y-auto bg-white rounded-lg border border-slate-200 p-4 animate-in fade-in duration-200 scrollbar-hide no-scrollbar">
                <div className="flex gap-4">
                  {/* Table of Contents - Compact */}
                  {contentHeadings.length > 0 && (
                    <div className="hidden lg:block w-48 shrink-0">
                      <div className="sticky top-0 p-3 rounded-lg border border-slate-100 bg-slate-50/50 space-y-2">
                        <div className="flex items-center gap-1.5 text-slate-500 font-semibold text-[10px] uppercase tracking-wide">
                          <Layout size={12} className="text-indigo-500" />
                          Contents
                        </div>
                        <ul className="space-y-0.5 text-[11px] text-slate-600 max-h-[50vh] overflow-y-auto scrollbar-hide">
                          {contentHeadings.slice(0, 20).map((h, idx) => {
                            const sectionStatus = sectionStatuses[h.id] || 'same';
                            return (
                              <li key={idx}>
                                <button
                                  type="button"
                                  onClick={() => scrollToHeading(h.id)}
                                  className={`flex items-center justify-between w-full text-left py-1 px-1.5 rounded hover:bg-indigo-50 hover:text-indigo-600 transition-colors truncate ${h.level === 1 ? 'font-semibold text-slate-700' : 'pl-3 text-slate-500 text-[10px]'}`}
                                >
                                  <span className="truncate">{h.text}</span>
                                  {inlineHL.enabled && sectionStatus !== 'same' && (
                                    <div className={`w-1 h-1 rounded-full shrink-0 ml-1 ${sectionStatus === 'added' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                  )}
                                </button>
                              </li>
                            );
                          })}
                          {contentHeadings.length > 20 && (
                            <li className="text-[9px] text-slate-400 italic pl-1.5">+{contentHeadings.length - 20} more</li>
                          )}
                        </ul>
                        <button
                          onClick={toggleInlineHighlight}
                          disabled={inlineHL.loading}
                          className={`w-full px-2 py-1.5 rounded text-[9px] font-semibold uppercase tracking-wide transition-all ${inlineHL.enabled ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-300'}`}
                        >
                          {inlineHL.loading ? '...' : inlineHL.enabled ? 'Hide Δ' : 'Show Δ'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    <div ref={contentRef} className="font-sans text-[13px] leading-6 text-slate-700 space-y-2">
                      {contentBlocks.map((b, i) => {
                        if (b.type === 'heading') {
                          const base = b.level === 1
                            ? 'text-base font-bold text-slate-900 mt-6 mb-2 pb-1.5 border-b border-slate-100'
                            : b.level === 2
                              ? 'text-sm font-bold text-slate-800 mt-4 mb-1.5'
                              : 'text-sm font-semibold text-slate-700 mt-3 mb-1';
                          const hl = inlineStatuses && inlineStatuses[b.line] && inlineStatuses[b.line] !== 'same'
                            ? (inlineStatuses[b.line] === 'added' ? ' bg-emerald-50 border-l-2 border-emerald-500 pl-2 -ml-2' : ' bg-amber-50 border-l-2 border-amber-500 pl-2 -ml-2')
                            : '';
                          const Tag = `h${Math.min(b.level, 6)}`;
                          return (
                            <Tag key={i} id={b.id} data-anchor-id={b.id} className={base + hl}>
                              {b.text}
                            </Tag>
                          );
                        }
                        const lineStatus = inlineStatuses?.[b.line] || 'same';
                        const rowCls = lineStatus === 'added'
                          ? 'bg-emerald-50/50 text-emerald-900 border-l-2 border-emerald-400 pl-2 -ml-2'
                          : lineStatus === 'changed'
                            ? 'bg-amber-50/50 text-amber-900 border-l-2 border-amber-400 pl-2 -ml-2'
                            : '';
                        return (
                          <p key={i} className={`whitespace-pre-wrap text-slate-600 ${rowCls}`}>
                            {b.text || '\n'}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {viewModal.activeTab === 'analysis' && (
              <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200 p-5 animate-in fade-in duration-300 scrollbar-hide no-scrollbar">
                {!analysisModal.data && !analysisModal.loading ? (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                    <Sparkles size={32} className="text-indigo-400 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-800 mb-2">AI Analysis</h3>
                    <p className="text-sm text-slate-500 mb-4 max-w-xs">Analyze this document for compliance, risks, and gaps.</p>
                    <button
                      onClick={() => handleAnalyzeBRD(viewModal.brd?.id)}
                      className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition-colors flex items-center gap-2"
                    >
                      <Zap size={16} /> Run Analysis
                    </button>
                  </div>
                ) : analysisModal.loading ? (
                  <div className="flex flex-col items-center justify-center h-full py-12">
                    <div className="w-10 h-10 border-3 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4" />
                    <p className="text-sm text-slate-500">Analyzing...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Score & Risk */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold ${analysisModal.data.score > 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {analysisModal.data.score}%
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">Quality Score</p>
                          <p className="text-xs text-slate-500">{analysisModal.data.risk_level} Risk</p>
                        </div>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${analysisModal.data.risk_level === 'Low' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {analysisModal.data.risk_level}
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                      <p className="text-sm text-indigo-800">{analysisModal.data.summary}</p>
                    </div>

                    {/* Strengths & Gaps */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-emerald-600 uppercase flex items-center gap-1.5">
                          <Check size={14} /> Strengths
                        </h4>
                        {analysisModal.data.strengths?.map((s, i) => (
                          <div key={i} className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-slate-700">
                            {s}
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-rose-600 uppercase flex items-center gap-1.5">
                          <AlertCircle size={14} /> Gaps
                        </h4>
                        {analysisModal.data.gaps?.map((g, i) => (
                          <div key={i} className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-sm text-slate-700">
                            {g}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}


            {viewModal.activeTab === 'workflow' && (
              <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200 p-5 animate-in fade-in duration-300 scrollbar-hide no-scrollbar">
                <div className="max-w-2xl">
                  <WorkflowPanel
                    brdId={viewModal.brd?.id}
                    currentStatus={viewModal.brd?.status || 'draft'}
                    assignedTo={viewModal.brd?.assigned_to}
                    userId={user?.id}
                    ownerId={viewModal.brd?.user_id}
                    onStatusChange={(newStatus, extras) => {
                      setViewModal(prev => ({
                        ...prev,
                        brd: {
                          ...prev.brd,
                          status: newStatus,
                          ...(extras?.assignedTo !== undefined ? { assigned_to: extras.assignedTo } : {})
                        }
                      }));
                      fetchBRDs();
                    }}
                  />
                </div>
              </div>
            )}

            {viewModal.activeTab === 'collaborators' && (
              <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200 p-5 animate-in fade-in duration-300 scrollbar-hide no-scrollbar">
                <CollaboratorsPanel
                  brdId={viewModal.brd?.id}
                  userId={user?.id}
                  userPermission={viewModal.brd?.user_permission}
                />
              </div>
            )}

            {viewModal.activeTab === 'activity' && (
              <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200 p-5 animate-in fade-in duration-300 scrollbar-hide no-scrollbar">
                <ActivityLog brdId={viewModal.brd?.id} />
              </div>
            )}

            {viewModal.activeTab === 'diagrams' && (
              <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200 p-5 animate-in fade-in duration-300 scrollbar-hide no-scrollbar">
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Architectural Diagrams</h3>
                      <p className="text-xs text-slate-500">Visual representations linked to this requirement.</p>
                    </div>
                    <button
                      onClick={() => router.push('/dashboard/diagrams')}
                      className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold border border-indigo-100 hover:bg-indigo-100 transition"
                    >
                      Manage All Diagrams
                    </button>
                  </div>

                  {loadingDiagrams ? (
                    <div className="flex items-center justify-center py-20">
                      <RefreshCw className="animate-spin text-indigo-500" size={32} />
                    </div>
                  ) : brdDiagrams.length > 0 ? (
                    <div className="grid grid-cols-1 gap-8">
                      {brdDiagrams.map(diagram => (
                        <div key={diagram.id} className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-white/50">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                              <span className="font-bold text-slate-700">{diagram.title}</span>
                              <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full text-slate-500 uppercase">{diagram.diagram_type}</span>
                            </div>
                          </div>
                          <div className="p-4">
                            <MermaidViewer code={diagram.mermaid_code} id={diagram.id} />
                            {diagram.description && (
                              <p className="mt-4 text-[11px] text-slate-500 italic text-center px-4">{diagram.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                      <GitBranch size={48} className="text-slate-200 mb-4" />
                      <h4 className="text-slate-800 font-bold">No Diagrams Linked</h4>
                      <p className="text-slate-500 text-xs mt-1 max-w-[240px]">Go to the Diagrams module to generate a visualization for this BRD.</p>
                      <button
                        onClick={() => router.push('/dashboard/diagrams')}
                        className="mt-6 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition"
                      >
                        Create with AI
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {viewModal.activeTab === 'comments' && (
              <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-slate-200 p-5 animate-in fade-in duration-300 scrollbar-hide no-scrollbar">
                <Comments
                  brdId={viewModal.brd?.id}
                  userPermission={viewModal.brd?.user_permission}
                  brdContent={viewModal.brd?.content}
                />
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Side-by-Side Comparison Modal */}
      <Modal
        isOpen={compareModal.open}
        onClose={() => setCompareModal(p => ({ ...p, open: false }))}
        title={
          <div className="flex items-center gap-2">
            <GitCompare size={24} className="text-indigo-600" />
            <span>Protocol Delta Comparison</span>
          </div>
        }
        size="xl"
      >
        <div className="flex flex-col h-[80vh]">
          {/* Header Info */}
          <div className="flex items-center justify-between mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="text-center flex-1">
              <span className="px-4 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-black uppercase tracking-wider">Source v{compareModal.v1}.0</span>
            </div>
            <div className="px-6 text-slate-300 font-black italic">VS</div>
            <div className="text-center flex-1">
              <span className="px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-black uppercase tracking-wider">Target v{compareModal.v2}.0</span>
            </div>
          </div>

          {/* Comparison View */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden">
            <div className="flex flex-col bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-100 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Clock size={14} /> Historical Baseline
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-4 scrollbar-hide">
                {diffView.left.map((line, idx) => (
                  <div key={idx} className={`flex items-start gap-4 py-1.5 font-mono text-[11px] ${line.status === 'removed' ? 'bg-rose-50/50 text-rose-700' : 'text-slate-500 opacity-60'}`}>
                    <span className="w-8 text-right pr-2 text-slate-300 select-none border-r border-slate-100">{idx + 1}</span>
                    <span className="flex-1 whitespace-pre-wrap">{line.text || ' '}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-indigo-50/50 border-b border-indigo-100 font-black text-[10px] text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Sparkles size={14} /> Modernized Revision
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-4 scrollbar-hide">
                {diffView.right.map((line, idx) => (
                  <div key={idx} className={`flex items-start gap-4 py-1.5 font-mono text-[11px] ${line.status === 'added' ? 'bg-emerald-50 text-emerald-700 font-bold' : line.status === 'changed' ? 'bg-amber-50 text-amber-900 font-bold' : 'text-slate-700'}`}>
                    <span className="w-8 text-right pr-2 text-slate-300 select-none border-r border-slate-100">{idx + 1}</span>
                    <span className="flex-1 whitespace-pre-wrap">{line.text || ' '}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-8">
            <button
              onClick={() => setCompareModal(p => ({ ...p, open: false }))}
              className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all shadow-2xl active:scale-95"
            >
              Terminate Inspection
            </button>
          </div>
        </div>
      </Modal >

      {/* Standalone Activity Audit (legacy fallback) */}
      < Modal
        isOpen={analysisModal.open && !viewModal.open}
        onClose={() => setAnalysisModal({ open: false, data: null, loading: false })}
        title="Protocol Analysis"
      >
        <div className="p-8 text-center space-y-4">
          <p className="font-bold text-slate-600">Enhanced Analysis available within the Master Viewer.</p>
          <button onClick={() => setAnalysisModal({ open: false, data: null, loading: false })} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold">Acknowledge</button>
        </div>
      </Modal >

      <Modal
        isOpen={editModal.open}
        onClose={() => setEditModal({ open: false, brd: null })}
        title="Content Revision"
        size="xl"
      >
        <div className="flex flex-col h-[70vh] bg-white">
          <div className="flex-1 overflow-y-auto p-10 space-y-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Document Identity</label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-[15px] font-black text-slate-900 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-3 flex-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Protocol Payload (Markdown)</label>
              <textarea
                value={editForm.content}
                onChange={(e) => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                className="w-full h-[350px] px-6 py-6 bg-slate-50 border border-slate-200 rounded-[2.5rem] text-[14px] font-mono leading-relaxed focus:border-indigo-500 outline-none transition-all resize-none"
              />
            </div>
          </div>
          <div className="p-8 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <button onClick={() => setEditModal({ open: false, brd: null })} className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">Discard Changes</button>
            <button onClick={handleUpdateBRD} disabled={saving} className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2">
              {saving ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
              Commit Revisions
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, brdId: null })}
        title="Terminal Deletion"
      >
        <div className="space-y-6">
          <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl text-rose-700">
            <p className="font-black text-lg mb-2">Critical Action Required</p>
            <p className="text-sm font-bold opacity-80">This will permanently purge this protocol and all associated history items. This action is irreversible.</p>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setDeleteConfirm({ open: false, brdId: null })} className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all">Abort</button>
            <button onClick={handleDeleteBRD} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-rose-100 hover:bg-rose-700 transition-all">Confirm Purge</button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={versionsModal.open}
        onClose={() => setVersionsModal({ open: false, brdId: null, versions: [] })}
        title="Protocol Records"
      >
        <div className="space-y-4">
          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-2">
            {versionsModal.versions.map((v, i) => (
              <div
                key={i}
                onClick={() => {
                  if (compareModal.v1 === v.version_number) setCompareModal(p => ({ ...p, v1: null }));
                  else if (compareModal.v2 === v.version_number) setCompareModal(p => ({ ...p, v2: null }));
                  else if (!compareModal.v1) handleFetchVersionForCompare(versionsModal.brdId, v.version_number, 1);
                  else if (!compareModal.v2) handleFetchVersionForCompare(versionsModal.brdId, v.version_number, 2);
                }}
                className={`flex items-center justify-between p-5 rounded-3xl border-2 transition-all cursor-pointer ${compareModal.v1 === v.version_number || compareModal.v2 === v.version_number ? 'border-indigo-600 bg-indigo-50 shadow-lg' : 'border-slate-100 bg-white hover:border-slate-200'}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${compareModal.v1 === v.version_number || compareModal.v2 === v.version_number ? 'bg-indigo-600 text-white rotate-3' : 'bg-slate-50 text-slate-400'}`}>{v.version_number}</div>
                  <div>
                    <p className="font-black text-slate-900">Release {v.version_number}.0</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{formatDate(v.created_at)}</p>
                  </div>
                </div>
                {(compareModal.v1 === v.version_number || compareModal.v2 === v.version_number) && (
                  <div className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-black rounded-lg uppercase tracking-widest shadow-lg shadow-indigo-100">
                    Slot {compareModal.v1 === v.version_number ? 'A' : 'B'}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            disabled={!compareModal.v1 || !compareModal.v2}
            onClick={() => { setCompareModal(p => ({ ...p, open: true })); setVersionsModal(p => ({ ...p, open: false })); }}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl hover:bg-black transition-all disabled:opacity-30 active:scale-95"
          >
            Execute Delta Analysis
          </button>
        </div>
      </Modal>
    </div >
  );
}
