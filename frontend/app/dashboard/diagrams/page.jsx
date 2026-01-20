"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  GitBranch,
  Plus,
  Sparkles,
  Search,
  Filter,
  Download,
  Trash2,
  Copy,
  Eye,
  FileText,
  ChevronRight,
  Save,
  Check,
  AlertCircle,
  RefreshCw,
  Clock,
  X,
  Activity,
  ArrowRightLeft,
  Box,
  Users,
  Component,
  Database,
  Link as LinkIcon
} from 'lucide-react';
import api from '@/lib/api';
import MermaidViewer from '@/components/MermaidViewer';
import { useProjectStore } from '@/store';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';

const DiagramsPage = () => {
  const [diagrams, setDiagrams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('gallery'); // gallery, creator
  const [filterType, setFilterType] = useState('all');

  // AI Creator State
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selectedBrd, setSelectedBrd] = useState('');
  const [brds, setBrds] = useState([]);
  const [diagramType, setDiagramType] = useState('flowchart');
  const [generatedResult, setGeneratedResult] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);


  const [previewModal, setPreviewModal] = useState({ open: false, diagram: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, diagramId: null, diagramTitle: '' });
  const [linkModal, setLinkModal] = useState({ open: false, diagram: null });
  const [storyPreviewModal, setStoryPreviewModal] = useState({ open: false, stories: [], diagram: null });
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const { activeGroupId, activeGroupName, setActiveProject } = useProjectStore();
  const [userGroups, setUserGroups] = useState([]);

  useEffect(() => {
    fetchDiagrams();
    fetchBrds();
    loadGroups();
  }, []);


  const fetchDiagrams = async () => {
    try {
      setLoading(true);
      const res = await api.get('/diagrams');
      setDiagrams(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch diagrams:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBrds = async () => {
    try {
      const res = await api.get('/brd');
      setBrds(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch BRDs:', err);
    }
  };

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

  const handleGenerate = async () => {
    if (!prompt && !selectedBrd) return;

    try {
      setGenerating(true);
      setStatus({ type: 'info', message: 'Generating diagram with AI...' });
      const res = await api.post('/diagrams/generate', {
        brdId: selectedBrd,
        prompt: prompt,
        type: diagramType
      });

      setGeneratedResult(res.data.data);
      setActiveTab('creator');
      setStatus({ type: 'success', message: 'Diagram generated successfully!' });
    } catch (err) {
      console.error('Generation failed:', err);
      setStatus({ type: 'error', message: 'Failed to generate diagram. Please try again.' });
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedResult) return;

    try {
      setSaveLoading(true);
      await api.post('/diagrams', {
        title: generatedResult.title,
        description: generatedResult.description,
        mermaidCode: generatedResult.mermaid_code,
        type: diagramType,
        groupId: activeGroupId,
        brdId: selectedBrd
      });

      setSaveSuccess(true);
      setStatus({ type: 'success', message: 'Diagram saved to gallery!' });
      fetchDiagrams();
      setTimeout(() => {
        setSaveSuccess(false);
        setActiveTab('gallery');
        setGeneratedResult(null);
        setPrompt('');
      }, 2000);
    } catch (err) {
      console.error('Save failed:', err);
      setStatus({ type: 'error', message: 'Failed to save diagram.' });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteDiagram = (diagram) => {
    setDeleteModal({
      open: true,
      diagramId: diagram.id,
      diagramTitle: diagram.title
    });
  };

  const performDelete = async () => {
    const { diagramId } = deleteModal;
    if (!diagramId) return;

    try {
      setDeleteLoading(true);
      await api.delete(`/diagrams/${diagramId}`);
      setDiagrams(prev => prev.filter(d => d.id !== diagramId));
      setDeleteModal({ open: false, diagramId: null, diagramTitle: '' });
      setStatus({ type: 'success', message: 'Diagram deleted successfully!' });
    } catch (err) {
      console.error('Delete failed:', err);
      setStatus({ type: 'error', message: 'Failed to delete diagram.' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDownloadDiagram = async (diagram, format = 'mermaid') => {
    try {
      const title = diagram.title.replace(/\s+/g, '_');

      if (format === 'mermaid') {
        const element = document.createElement("a");
        const file = new Blob([diagram.mermaid_code || diagram.diagram_data || ''], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `${title}_diagram.mermaid`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        setStatus({ type: 'success', message: 'Mermaid source downloaded!' });
        return;
      }

      // For SVG and PNG, we need the rendered SVG from the DOM
      // We'll try to find it by ID
      const container = document.querySelector(`[data-diagram-id="${diagram.id}"]`) ||
        document.getElementById('modal-preview');
      const svgElement = container?.querySelector('svg');

      if (!svgElement) {
        throw new Error('Could not find rendered diagram SVG');
      }

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      if (format === 'svg') {
        const element = document.createElement("a");
        element.href = url;
        element.download = `${title}_diagram.svg`;
        document.body.appendChild(element);
        element.click();
        document.body.click(); // dummy to remove warning or similar? no, element.click()
        document.body.removeChild(element);
      } else if (format === 'png') {
        const canvas = document.createElement('canvas');
        const img = new Image();

        img.onload = () => {
          // Add some padding
          const padding = 40;
          canvas.width = svgElement.viewBox.baseVal.width + (padding * 2);
          canvas.height = svgElement.viewBox.baseVal.height + (padding * 2);

          const ctx = canvas.getContext('2d');
          // Set white background
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.drawImage(img, padding, padding);

          const pngUrl = canvas.toDataURL('image/png');
          const element = document.createElement("a");
          element.href = pngUrl;
          element.download = `${title}_diagram.png`;
          document.body.appendChild(element);
          element.click();
          document.body.removeChild(element);
          URL.revokeObjectURL(url);
        };

        img.src = url;
      }

      if (format !== 'mermaid') {
        setStatus({ type: 'success', message: `${format.toUpperCase()} image downloaded!` });
      }
    } catch (err) {
      console.error('Download failed:', err);
      setStatus({ type: 'error', message: 'Download failed. Please try again.' });
    }
  };

  const handleExtractStories = async (diagram) => {
    try {
      setExtractionLoading(true);
      setStatus({ type: 'info', message: 'Analyzing diagram to extract user stories...' });

      const res = await api.post(`/diagrams/${diagram.id}/extract-stories`);

      if (res.data.success) {
        const stories = res.data.data;
        setStatus({ type: 'success', message: `Successfully extracted ${stories.length} user stories!` });
        setStoryPreviewModal({ open: true, stories, diagram });
      }
    } catch (err) {
      console.error('Extraction failed:', err);
      setStatus({ type: 'error', message: 'Failed to extract stories from diagram.' });
    } finally {
      setExtractionLoading(false);
    }
  };

  const handleSaveStories = async () => {
    try {
      setSaveLoading(true);
      const { stories, diagram } = storyPreviewModal;
      const res = await api.post(`/diagrams/${diagram.id}/save-stories`, { stories });

      if (res.data.success) {
        setStatus({ type: 'success', message: 'Stories saved to project backlog!' });
        setStoryPreviewModal({ open: false, stories: [], diagram: null });
      }
    } catch (err) {
      console.error('Saving stories failed:', err);
      setStatus({ type: 'error', message: 'Failed to save stories.' });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleLinkToBrd = async (diagramId, brdId) => {
    try {
      const res = await api.post('/diagrams/link', { diagramId, brdId });
      if (res.data.success) {
        setStatus({ type: 'success', message: 'Diagram linked to BRD successfully!' });
        setLinkModal({ open: false, diagram: null });
      }
    } catch (err) {
      console.error('Linking failed:', err);
      setStatus({ type: 'error', message: 'Failed to link diagram to BRD.' });
    }
  };

  const handlePreviewDiagram = (diagram) => {
    setPreviewModal({ open: true, diagram });
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ type: 'success', message: 'Copied to clipboard!' });
    } catch {
      console.error('Copy failed');
      setStatus({ type: 'error', message: 'Failed to copy to clipboard.' });
    }
  };

  const filteredDiagrams = useMemo(() => {
    let list = [...diagrams];

    // Filter by search
    if (searchQuery) {
      list = list.filter(d =>
        d.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by type
    if (filterType !== 'all') {
      list = list.filter(d => d.diagram_type === filterType);
    }

    // Filter by group
    if (activeGroupId && activeGroupId !== 'all') {
      list = list.filter(d => String(d.group_id) === String(activeGroupId));
    }

    return list;
  }, [diagrams, searchQuery, filterType, activeGroupId]);

  // Stats
  const stats = useMemo(() => ({
    total: diagrams.length,
    flowchart: diagrams.filter(d => d.diagram_type === 'flowchart').length,
    sequence: diagrams.filter(d => d.diagram_type === 'sequence').length,
    usecase: diagrams.filter(d => d.diagram_type === 'usecase').length,
    other: diagrams.filter(d => !['flowchart', 'sequence', 'usecase'].includes(d.diagram_type)).length,
  }), [diagrams]);

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
                  <div className="p-2 bg-indigo-600 rounded-lg">
                    <GitBranch size={24} className="text-white" />
                  </div>
                  <h1 className="text-3xl font-bold text-gray-900">AI Diagrams</h1>
                </div>
                <p className="text-gray-600 ml-11">Generate, manage and link visual architecture to your business requirements.</p>
              </div>

              <div className="flex items-center gap-4 bg-white p-2 rounded-xl shadow-sm border border-gray-200">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-gray-400 ml-1">Active Project</span>
                  <select
                    className="bg-transparent border-none text-sm font-semibold text-indigo-900 focus:outline-none cursor-pointer"
                    value={activeGroupId || 'all'}
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
                  onClick={fetchDiagrams}
                  className="btn flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-all"
                  disabled={loading}
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </button>

                <button
                  onClick={() => setActiveTab('creator')}
                  className="btn flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg"
                >
                  <Sparkles size={20} />
                  Generate Diagram
                </button>
              </div>
            </div>


            {/* Tabs */}
            <div className="bg-white rounded-lg border border-gray-200 p-1.5 inline-flex gap-1">
              <button
                onClick={() => setActiveTab('gallery')}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'gallery'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                Gallery
              </button>
              <button
                onClick={() => setActiveTab('creator')}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'creator'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <Sparkles size={16} />
                New with AI
              </button>
            </div>

            {activeTab === 'gallery' ? (
              <>
                {/* Search and Filters */}
                <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        type="text"
                        placeholder="Search diagrams by title or description..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                      />
                    </div>

                    <div className="flex gap-3">
                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white"
                      >
                        <option value="all">All Types</option>
                        <option value="flowchart">Flowchart</option>
                        <option value="sequence">Sequence</option>
                        <option value="class">Class Diagram</option>
                        <option value="uml">UML Diagram</option>
                        <option value="usecase">Use Case</option>
                        <option value="er">ER Diagram</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Total Diagrams</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Flowcharts</p>
                    <p className="text-2xl font-bold text-indigo-600">{stats.flowchart}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Sequence</p>
                    <p className="text-2xl font-bold text-blue-600">{stats.sequence}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Other Types</p>
                    <p className="text-2xl font-bold text-purple-600">{stats.other}</p>
                  </div>
                </div>

                {/* Gallery Grid */}
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-center">
                      <div className="animate-spin h-12 w-12 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-gray-600">Loading diagrams...</p>
                    </div>
                  </div>
                ) : filteredDiagrams.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredDiagrams.map((diagram) => (
                      <div key={diagram.id} className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 relative">
                        <div className="p-4 border-b border-gray-100 bg-gray-50 text-sm font-medium text-gray-700 flex items-center justify-between">
                          <span className="text-[10px] font-black bg-white/50 px-2.5 py-1 rounded-lg text-indigo-600 border border-indigo-100 shadow-sm flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                            {diagram.diagram_type || 'diagram'}
                          </span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition translate-x-2 group-hover:translate-x-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePreviewDiagram(diagram); }}
                              className="p-1.5 hover:bg-indigo-600 rounded-lg text-gray-500 hover:text-white transition shadow-sm bg-white border border-gray-100"
                              title="Full Preview"
                            >
                              <Eye size={16} />
                            </button>
                            <div className="relative group/download">
                              <button
                                className="p-1.5 hover:bg-emerald-600 rounded-lg text-gray-400 hover:text-white transition shadow-sm bg-white border border-gray-100"
                                title="Download Options"
                              >
                                <Download size={16} />
                              </button>
                              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-lg shadow-xl py-1 w-32 opacity-0 invisible group-hover/download:opacity-100 group-hover/download:visible transition-all z-20">
                                <button onClick={(e) => { e.stopPropagation(); handleDownloadDiagram(diagram, 'png'); }} className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-gray-600 hover:bg-gray-50 flex items-center justify-between">PNG Image <span className="bg-emerald-100 text-emerald-600 px-1 rounded text-[8px]">PRO</span></button>
                                <button onClick={(e) => { e.stopPropagation(); handleDownloadDiagram(diagram, 'svg'); }} className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-gray-600 hover:bg-gray-50 flex items-center justify-between">SVG Vector</button>
                                <button onClick={(e) => { e.stopPropagation(); handleDownloadDiagram(diagram, 'mermaid'); }} className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-gray-600 hover:bg-gray-50 border-t border-gray-50">Mermaid Code</button>
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); copyToClipboard(diagram.mermaid_code || diagram.diagram_data); }}
                              className="p-1.5 hover:bg-indigo-600 rounded-lg text-gray-400 hover:text-white transition shadow-sm bg-white border border-gray-100"
                              title="Copy Code"
                            >
                              <Copy size={16} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteDiagram(diagram); }}
                              className="p-1.5 hover:bg-red-600 rounded-lg text-gray-400 hover:text-white transition shadow-sm bg-white border border-gray-100"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setLinkModal({ open: true, diagram }); }}
                              className="p-1.5 hover:bg-indigo-600 rounded-lg text-gray-400 hover:text-white transition shadow-sm bg-white border border-gray-100"
                              title="Link to Project"
                            >
                              <LinkIcon size={16} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleExtractStories(diagram); }}
                              className="p-1.5 hover:bg-amber-500 rounded-lg text-gray-400 hover:text-white transition shadow-sm bg-white border border-gray-100"
                              title="Extract User Stories (Crystalize)"
                              disabled={extractionLoading}
                            >
                              <Sparkles size={16} className={extractionLoading ? 'animate-spin' : ''} />
                            </button>
                          </div>
                        </div>
                        <div className="p-5">
                          <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-1">{diagram.title}</h3>
                          <p className="text-sm text-gray-500 mb-4 line-clamp-2 h-10">{diagram.description || 'No description provided.'}</p>

                          <div
                            className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center justify-center cursor-pointer hover:bg-gray-100 transition group/preview relative min-h-[140px]"
                            onClick={() => handlePreviewDiagram(diagram)}
                          >
                            <div className="w-full pointer-events-none transform scale-90">
                              <MermaidViewer code={diagram.mermaid_code || diagram.diagram_data} id={diagram.id} />
                            </div>
                            <div className="absolute inset-0 bg-indigo-600/0 group-hover/preview:bg-indigo-600/10 transition-all rounded-xl flex items-center justify-center">
                              <div className="bg-white p-3 rounded-full shadow-2xl scale-0 group-hover/preview:scale-100 transition-all duration-300 transform hover:rotate-12">
                                <Eye size={24} className="text-indigo-600" />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mt-4 text-xs text-gray-400">
                            <Clock size={14} />
                            <span>{new Date(diagram.created_at).toLocaleDateString()}</span>
                            {diagram.brd_id && (
                              <>
                                <span>•</span>
                                <LinkIcon size={14} />
                                <span>Linked to BRD</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                    <div className="p-4 bg-indigo-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                      <GitBranch size={32} className="text-indigo-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {searchQuery ? 'No diagrams found' : 'No diagrams yet'}
                    </h3>
                    <p className="text-gray-500 mb-6">
                      {searchQuery ? 'Try a different search term' : 'Use the AI creator to generate automated system diagrams from your requirements.'}
                    </p>
                    {!searchQuery && (
                      <button
                        onClick={() => setActiveTab('creator')}
                        className="btn inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all"
                      >
                        <Sparkles size={20} />
                        Generate First Diagram
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {/* Creator Inputs */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 rounded-xl text-white shadow-lg">
                      <Sparkles size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">AI Diagram Generator</h2>
                      <p className="text-gray-500 text-sm">Describe your flow or select a BRD to visualize.</p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 ml-1 flex items-center gap-2">
                        <FileText size={14} className="text-indigo-600" />
                        Context Source
                      </label>
                      <select
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition font-medium"
                        value={selectedBrd}
                        onChange={(e) => setSelectedBrd(e.target.value)}
                      >
                        <option value="">User Prompt Only (Free-form)</option>
                        {brds.map(brd => (
                          <option key={brd.id} value={brd.id}>{brd.title}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 ml-1">Diagram Type</label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'flowchart', label: 'Flowchart', icon: <Activity size={16} /> },
                          { id: 'sequence', label: 'Sequence', icon: <ArrowRightLeft size={16} /> },
                          { id: 'class', label: 'Class', icon: <Box size={16} /> },
                          { id: 'uml', label: 'UML', icon: <Component size={16} /> },
                          { id: 'usecase', label: 'Use Case', icon: <Users size={16} /> },
                          { id: 'er', label: 'ER Diagram', icon: <Database size={16} /> },
                        ].map(t => (
                          <button
                            key={t.id}
                            onClick={() => setDiagramType(t.id)}
                            className={`px-4 py-3 rounded-lg border text-sm font-bold transition flex items-center justify-center gap-2 ${diagramType === t.id
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                              }`}
                          >
                            {t.icon}
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 ml-1">Describe what to visualize</label>
                      <textarea
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-gray-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition min-h-[160px] resize-none font-medium text-sm leading-relaxed"
                        placeholder="e.g. Show the sequence of steps for the approval workflow including the manager and analyst roles..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                      />
                    </div>

                    <button
                      onClick={handleGenerate}
                      disabled={generating || (!prompt && !selectedBrd)}
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                    >
                      {generating ? (
                        <>
                          <RefreshCw className="animate-spin" size={20} />
                          Synthesizing Architecture...
                        </>
                      ) : (
                        <>
                          <Sparkles size={20} />
                          Generate Architecture
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Preview Panel */}
                <div className="space-y-4 lg:h-full flex flex-col">
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden h-full flex flex-col shadow-sm">
                    <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
                      <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                        <Eye size={16} />
                        Live Preview
                      </div>
                      {generatedResult && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSave}
                            disabled={saveLoading}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${saveSuccess
                              ? 'bg-green-500 text-white'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
                              }`}
                          >
                            {saveLoading ? (
                              <RefreshCw className="animate-spin" size={16} />
                            ) : saveSuccess ? (
                              <Check size={16} />
                            ) : (
                              <Save size={16} />
                            )}
                            {saveSuccess ? 'Saved!' : 'Save to Workspace'}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 overflow-auto p-6 bg-white">
                      {generatedResult ? (
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <h3 className="text-xl font-bold text-gray-900">{generatedResult.title}</h3>
                            <p className="text-gray-500 text-sm italic">{generatedResult.description}</p>
                          </div>

                          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <MermaidViewer code={generatedResult.mermaid_code} id="preview" />
                          </div>

                          <div className="space-y-3 pt-4 border-t border-gray-100">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-gray-400">Mermaid Syntax</span>
                              <button
                                onClick={() => copyToClipboard(generatedResult.mermaid_code)}
                                className="text-indigo-600 hover:text-indigo-700 text-xs flex items-center gap-1 transition font-medium"
                              >
                                <Copy size={12} />
                                Copy Code
                              </button>
                            </div>
                            <pre className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700 overflow-auto max-h-[200px] font-mono leading-relaxed">
                              {generatedResult.mermaid_code}
                            </pre>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-16">
                          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 mb-6">
                            <Eye size={32} />
                          </div>
                          <h3 className="text-lg font-medium text-gray-700">Preview Area</h3>
                          <p className="text-gray-500 text-sm mt-2 max-w-[240px]">Generated diagrams will appear here for review before saving.</p>

                          <div className="mt-12 flex flex-col items-center gap-3">
                            <div className="flex gap-2">
                              {[1, 2, 3].map(i => <div key={i} className="w-24 h-2 bg-gray-100 rounded-full"></div>)}
                            </div>
                            <div className="w-48 h-2 bg-gray-100 rounded-full"></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hint Box */}
                  {!generatedResult && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-4">
                      <AlertCircle className="text-amber-600 shrink-0" size={20} />
                      <div className="text-sm text-amber-800">
                        <span className="font-bold text-amber-700 block mb-1 text-xs">Pro Tip</span>
                        The AI is highly optimized for Mermaid syntax. Selecting a BRD provides context for higher accuracy in business logic mapping.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      {/* Preview Modal */}
      <Modal
        isOpen={previewModal.open}
        onClose={() => setPreviewModal({ open: false, diagram: null })}
        title={
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-indigo-600 rounded-lg text-white">
              <GitBranch size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">{previewModal.diagram?.title || 'Diagram Preview'}</h2>
              <p className="text-[10px] text-slate-400 font-bold leading-none mt-0.5">{previewModal.diagram?.diagram_type}</p>
            </div>
          </div>
        }
        size="xl"
      >
        <div className="flex flex-col h-[75vh]">
          <div className="flex-1 overflow-auto bg-slate-50 rounded-2xl border border-slate-200 p-8 flex items-center justify-center group/modal-view relative">
            <MermaidViewer code={previewModal.diagram?.mermaid_code} id="modal-preview" />

            <div className="absolute top-4 right-4 flex gap-2 invisible group-hover/modal-view:visible animate-in fade-in duration-200">
              <button
                onClick={() => handleDownloadDiagram(previewModal.diagram, 'png')}
                className="bg-emerald-600 px-4 py-2 rounded-xl text-xs font-black text-white hover:bg-emerald-700 transition shadow-lg flex items-center gap-2"
              >
                <Download size={14} /> Download PNG
              </button>
              <button
                onClick={() => handleDownloadDiagram(previewModal.diagram, 'svg')}
                className="bg-white px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition shadow-sm flex items-center gap-2"
              >
                <Download size={14} /> Download SVG
              </button>
              <button
                onClick={() => handleDownloadDiagram(previewModal.diagram, 'mermaid')}
                className="bg-white px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition shadow-sm flex items-center gap-2"
              >
                <Copy size={14} /> Source Code
              </button>
            </div>
          </div>

          <div className="mt-6 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h4 className="text-xs font-black text-slate-400">Description</h4>
              <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">{previewModal.diagram?.description || 'No description provided for this architecture visualization.'}</p>
            </div>

            <div className="flex items-center gap-6 divide-x divide-slate-100">
              <div className="flex flex-col items-center px-4">
                <span className="text-[10px] font-black text-slate-400 mb-1">Created</span>
                <span className="text-xs font-bold text-slate-700">{previewModal.diagram?.created_at ? new Date(previewModal.diagram.created_at).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div className="flex flex-col items-center pl-6">
                <span className="text-[10px] font-black text-slate-400 mb-1">Status</span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Active
                </span>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, diagramId: null, diagramTitle: '' })}
        title={
          <div className="flex items-center gap-3 text-red-600">
            <div className="p-1.5 bg-red-50 rounded-lg">
              <Trash2 size={16} />
            </div>
            <h2 className="text-sm font-bold">Confirm Deletion</h2>
          </div>
        }
        size="sm"
      >
        <div className="space-y-6">
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-sm text-red-800 leading-relaxed font-bold">
              Are you sure you want to permanently delete <span className="underline decoration-red-300">"{deleteModal.diagramTitle}"</span>?
            </p>
            <p className="text-[11px] text-red-600 mt-2 font-medium">This action cannot be undone and will remove all links to BRDs.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setDeleteModal({ open: false, diagramId: null, diagramTitle: '' })}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={performDelete}
              disabled={deleteLoading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-xs font-bold text-white hover:bg-red-700 transition shadow-sm flex items-center justify-center gap-2"
            >
              {deleteLoading ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete Permanently
            </button>
          </div>
        </div>
      </Modal>

      {/* Link to Project Modal */}
      <Modal
        isOpen={linkModal.open}
        onClose={() => setLinkModal({ open: false, diagram: null })}
        title="Link Diagram to Project"
      >
        <div className="space-y-6">
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
            <p className="text-sm text-indigo-700 font-medium mb-1">Diagram:</p>
            <p className="text-lg font-bold text-indigo-900">{linkModal.diagram?.title}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 ml-1">Select Project (BRD)</label>
            <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2">
              {brds.length > 0 ? brds.map(brd => (
                <button
                  key={brd.id}
                  onClick={() => handleLinkToBrd(linkModal.diagram.id, brd.id)}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-white transition">
                      <FileText size={18} className="text-gray-500 group-hover:text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 line-clamp-1">{brd.title}</p>
                      <p className="text-[10px] text-gray-500">{new Date(brd.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 group-hover:text-indigo-500" />
                </button>
              )) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 italic">No business requirements documents found.</p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              onClick={() => setLinkModal({ open: false, diagram: null })}
              className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition shadow-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Extracted Stories Preview Modal */}
      <Modal
        isOpen={storyPreviewModal.open}
        onClose={() => setStoryPreviewModal({ open: false, stories: [], diagram: null })}
        title="Extracted User Stories"
        size="xl"
      >
        <div className="space-y-6">
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
              <Sparkles size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">AI Logic Extraction</p>
              <p className="text-xs text-amber-700">Derived from: {storyPreviewModal.diagram?.title}</p>
            </div>
          </div>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {storyPreviewModal.stories.map((story, i) => (
              <div key={i} className="p-5 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="text-lg font-bold text-gray-900">{story.title}</h4>
                  <span className={`px-2 py-1 rounded-md text-[10px] font-black ${story.priority === 'P0' ? 'bg-red-100 text-red-600' :
                    story.priority === 'P1' ? 'bg-amber-100 text-amber-600' :
                      'bg-blue-100 text-blue-600'
                    }`}>
                    {story.priority}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded-xl italic">
                  "{story.description}"
                </p>
                {story.acceptance_criteria && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Acceptance Criteria</p>
                    <ul className="grid grid-cols-1 gap-1.5">
                      {story.acceptance_criteria.map((ac, j) => (
                        <li key={j} className="flex items-center gap-2 text-xs text-gray-500">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                          {ac}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="pt-4 flex gap-4">
            <button
              onClick={() => setStoryPreviewModal({ open: false, stories: [], diagram: null })}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition"
            >
              Discard
            </button>
            <button
              onClick={handleSaveStories}
              disabled={saveLoading}
              className="flex-[2] px-4 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
            >
              {saveLoading ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
              Save All to Backlog
            </button>
          </div>
        </div>
      </Modal>

      {/* Standard Notification Toaster (Matching BRDs Page) */}
      {status && (
        <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-[9999] p-4 rounded-xl border-l-4 text-sm font-bold transition-all duration-300 shadow-2xl min-w-[320px] max-w-md animate-in fade-in slide-in-from-top-4 ${status.type === 'error'
          ? 'border-l-red-500 bg-red-50 text-red-700 border border-red-200'
          : status.type === 'info'
            ? 'border-l-blue-500 bg-blue-50 text-blue-700 border border-blue-200'
            : 'border-l-green-500 bg-green-50 text-green-700 border border-green-200'
          }`}>
          <div className="flex items-start gap-4">
            <div className="mt-0.5">
              {status.type === 'error' ? (
                <AlertCircle size={20} className="text-red-500" />
              ) : status.type === 'info' ? (
                <Sparkles size={20} className="text-blue-500" />
              ) : (
                <Check size={20} className="text-green-500" />
              )}
            </div>
            <div className="flex-1 leading-tight">{status.message}</div>
            <button onClick={() => setStatus(null)} className="ml-2 text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiagramsPage;
