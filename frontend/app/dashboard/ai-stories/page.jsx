'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, RefreshCw, Wand2, Calculator, MessageSquare, Plus, Edit2, Trash2, Download, Search, SortDesc, ChevronDown, ChevronUp, Calendar, Eye, FileJson, FileSpreadsheet, FileText, Copy, Zap, AlertCircle, Check } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';
import api from '@/lib/api';
import { useAuthStore, useProjectStore } from '@/store';
import * as azureApi from '@/lib/azure-api';

const parseCriteria = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return [];
  }
};

export default function AIStoriesPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [requirementsText, setRequirementsText] = useState('');
  const [storyCount, setStoryCount] = useState(5);
  const [complexity, setComplexity] = useState('standard');
  const [language, setLanguage] = useState('');
  const [templateId, setTemplateId] = useState('');

  const [templates, setTemplates] = useState([]);
  const [stories, setStories] = useState([]);
  const [manualModal, setManualModal] = useState({ open: false, editingId: null });
  const [manualForm, setManualForm] = useState({
    title: '',
    description: '',
    acceptanceCriteria: '',
    priority: 'P2',
    status: 'draft',
    estimated_points: '',
    business_value: '',
    tags: '',
    azure_work_item_id: '',
    group_id: '',
  });

  const { activeGroupId, activeGroupName, setActiveProject } = useProjectStore();
  const [userGroups, setUserGroups] = useState([]);

  const [loadingStories, setLoadingStories] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState(null);

  // Auto-hide status after 5 seconds
  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const [refineModal, setRefineModal] = useState({ open: false, storyId: null, feedback: '' });
  const [estimatingIds, setEstimatingIds] = useState(new Set());

  const [expandedStory, setExpandedStory] = useState(null);
  const [detailsModal, setDetailsModal] = useState({ open: false, story: null });
  const [addModal, setAddModal] = useState({ open: false, mode: 'selection' });
  const [generateModal, setGenerateModal] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [selectedStories, setSelectedStories] = useState(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, storyId: null, count: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterAzure, setFilterAzure] = useState('all'); // all, with-azure, without-azure
  const [azureModal, setAzureModal] = useState({ open: false, storyId: null, workItemId: '' });
  const [azurePushModal, setAzurePushModal] = useState({
    open: false,
    storyId: null,
    storyTitle: '',
    selectedProject: '',
    selectedEpic: '',
    selectedFeature: '',
    newEpicName: '',
    newFeatureName: '',
    createNewEpic: false,
    createNewFeature: false,
    showConfirmation: false,
    tags: '',
    projects: [],
    epics: [],
    features: {},
    loading: false,
  });
  const [azurePatModal, setAzurePatModal] = useState({ open: false, patToken: '', testing: false, testResult: null });
  const [azureSettingsModal, setAzureSettingsModal] = useState({
    open: false,
    baseUrl: '',
    collection: '',
    project: '',
    testing: false,
    testResult: null,
  });
  const [pullFromAzureModal, setPullFromAzureModal] = useState({
    open: false,
    workItemId: '',
    loading: false,
    workItem: null,
    children: [],
    selectedChild: null,
  });
  const [bulkPushModal, setBulkPushModal] = useState({
    open: false,
    step: 'config', // 'config', 'progress', 'results'
    selectedProject: '',
    selectedEpic: '',
    selectedFeature: '',
    newEpicName: '',
    newFeatureName: '',
    createNewEpic: false,
    createNewFeature: false,
    tags: '',
    epics: [],
    features: {},
    loading: false,
    // Progress tracking
    currentIndex: 0,
    totalCount: 0,
    currentStory: null,
    progressLog: [],
    // Results
    results: null,
  });
  const [manualStory, setManualStory] = useState({

    title: '',
    description: '',
    acceptanceCriteria: '',
  });

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    // تحميل Azure PAT من localStorage
    const savedPat = localStorage.getItem('azure_pat');
    if (savedPat) {
      azureApi.setAzurePAT(savedPat);
      setAzurePatModal(prev => ({ ...prev, patToken: savedPat }));
    }
    loadTemplates();
    loadStories();
    loadGroups();
  }, [user, router]);

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

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const res = await api.get('/ai/stories/templates');
      const data = res.data?.data || [];
      setTemplates(data);
      const defaultTpl = data.find((t) => t.is_default);
      if (defaultTpl) {
        setTemplateId(String(defaultTpl.id));
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to load templates' });
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadStories = async () => {
    try {
      setLoadingStories(true);
      const res = await api.get('/ai/stories/all');
      const data = res.data?.data || [];
      setStories(data);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to load stories';
      setStatus({ type: 'error', message: msg });
    } finally {
      setLoadingStories(false);
    }
  };

  const resetManualForm = () => {
    setManualForm({
      title: '',
      description: '',
      acceptanceCriteria: '',
      priority: 'P2',
      status: 'draft',
      estimated_points: '',
      business_value: '',
      tags: '',
      azure_work_item_id: '',
    });
  };

  const openManualModal = (story = null) => {
    if (story) {
      setManualForm({
        title: story.title || '',
        description: story.description || '',
        acceptanceCriteria: Array.isArray(story.acceptance_criteria)
          ? story.acceptance_criteria.join('\n')
          : story.acceptance_criteria || '',
        priority: story.priority || 'P2',
        status: story.status || 'draft',
        estimated_points: story.estimated_points ?? '',
        business_value: story.business_value ?? '',
        tags: Array.isArray(story.tags) ? story.tags.join(', ') : story.tags || '',
        azure_work_item_id: story.azure_work_item_id || '',
      });
      setManualModal({ open: true, editingId: story.id });
      return;
    }

    resetManualForm();
    setManualModal({ open: true, editingId: null });
  };

  const saveManualStory = async () => {
    if (!manualForm.title.trim()) {
      setStatus({ type: 'error', message: 'Title is required' });
      return;
    }

    const acceptanceList = manualForm.acceptanceCriteria
      ? manualForm.acceptanceCriteria
        .split('\n')
        .map((c) => c.trim())
        .filter(Boolean)
      : [];

    const tagsList = manualForm.tags
      ? manualForm.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      : [];

    const payload = {
      title: manualForm.title.trim(),
      description: manualForm.description.trim(),
      acceptanceCriteria: acceptanceList,
      priority: manualForm.priority || 'P2',
      status: manualForm.status || 'draft',
      estimated_points: manualForm.estimated_points || null,
      business_value: manualForm.business_value || null,
      tags: tagsList,
      azure_work_item_id: manualForm.azure_work_item_id?.trim() || null,
      group_id: manualForm.group_id || activeGroupId || null,
    };

    try {
      if (manualModal.editingId) {
        const res = await api.put(`/ai/stories/${manualModal.editingId}`, payload);
        const updated = res.data?.data;
        if (updated) {
          setStories((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        }
        setStatus({ type: 'success', message: 'Story updated successfully' });
      } else {
        const res = await api.post('/ai/stories/manual', payload);
        const created = res.data?.data;
        if (created) {
          setStories((prev) => [created, ...prev]);
        }
        setStatus({ type: 'success', message: 'Story created successfully' });
      }

      setManualModal({ open: false, editingId: null });
      resetManualForm();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to save story';
      setStatus({ type: 'error', message: msg });
    }
  };

  const addManualStory = async () => {
    if (!manualStory.title.trim()) {
      setStatus({ type: 'error', message: 'Title is required' });
      return;
    }

    const acceptanceList = manualStory.acceptanceCriteria
      ? manualStory.acceptanceCriteria
        .split('\n')
        .map((c) => c.trim())
        .filter(Boolean)
      : [];

    try {
      const res = await api.post('/ai/stories/manual', {
        title: manualStory.title.trim(),
        description: manualStory.description.trim(),
        acceptanceCriteria: acceptanceList,
        status: 'draft',
        priority: 'P2',
      });

      const created = res.data?.data;
      if (created) {
        setStories((prev) => [created, ...prev]);
      }

      setStatus({ type: 'success', message: 'Story added successfully' });
      setManualStory({ title: '', description: '', acceptanceCriteria: '' });
      setAddModal({ open: false, mode: 'manual' });
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add story';
      setStatus({ type: 'error', message: msg });
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();

    if (!requirementsText.trim() || requirementsText.trim().length < 30) {
      setStatus({ type: 'error', message: 'Requirements must be at least 30 characters' });
      return;
    }

    try {
      setGenerating(true);
      const res = await api.post('/ai/stories/generate', {
        requirementsText: requirementsText.trim(),
        storyCount,
        complexity,
        language: language || undefined,
        templateId: templateId || undefined,
      });

      const generated = res.data?.data || [];
      if (generated.length > 0) {
        setStories((prev) => [...generated, ...prev]);
        setStatus({ type: 'success', message: `${generated.length} stories generated` });
      } else {
        setStatus({ type: 'error', message: 'No stories generated' });
      }

      setGenerateModal(false);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to generate stories';
      setStatus({ type: 'error', message: msg });
    } finally {
      setGenerating(false);
    }
  };

  const copyStory = async (story) => {
    const acceptance = parseCriteria(story.acceptance_criteria)
      .map((c) => `- ${c}`)
      .join('\n');

    const payload = [
      `Title: ${story.title || ''}`,
      `Description: ${story.description || ''}`,
      `Priority: ${story.priority || ''}`,
      `Status: ${story.status || ''}`,
      acceptance ? `Acceptance Criteria:\n${acceptance}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(payload);
      setStatus({ type: 'success', message: 'Story copied to clipboard' });
    } catch (err) {
      const msg = err.message || 'Failed to copy story';
      setStatus({ type: 'error', message: msg });
    }
  };

  const openRefine = (storyId) => {
    setRefineModal({ open: true, storyId, feedback: '' });
  };

  const deleteStory = async (id) => {
    setDeleteConfirm({ open: true, storyId: id, count: 1 });
  };

  const confirmDelete = async () => {
    const { storyId } = deleteConfirm;
    setDeleteConfirm({ open: false, storyId: null, count: 0 });

    try {
      await api.delete(`/ai/stories/${storyId}`);
      setStories((prev) => prev.filter((s) => s.id !== storyId));
      setSelectedStories((prev) => {
        const next = new Set(prev);
        next.delete(storyId);
        return next;
      });
      setStatus({ type: 'success', message: 'Story deleted successfully' });
    } catch (err) {
      const msg = err.response?.data?.error || 'Delete failed';
      setStatus({ type: 'error', message: msg });
    }
  };

  const deleteSelectedStories = async () => {
    if (selectedStories.size === 0) {
      setStatus({ type: 'error', message: 'Select stories to delete' });
      return;
    }
    setDeleteConfirm({ open: true, storyId: null, count: selectedStories.size });
  };

  const confirmDeleteSelected = async () => {
    const count = deleteConfirm.count;
    setDeleteConfirm({ open: false, storyId: null, count: 0 });

    try {
      for (const id of selectedStories) {
        await api.delete(`/ai/stories/${id}`);
      }
      setStories((prev) => prev.filter((s) => !selectedStories.has(s.id)));
      setSelectedStories(new Set());
      setStatus({ type: 'success', message: `${count} stories deleted successfully` });
    } catch (err) {
      const msg = err.response?.data?.error || 'Delete failed';
      setStatus({ type: 'error', message: msg });
    }
  };

  const linkAzureWorkItem = async () => {
    if (!azureModal.storyId || !azureModal.workItemId.trim()) {
      setStatus({ type: 'error', message: 'Work Item ID is required' });
      return;
    }
    try {
      const payload = { azure_work_item_id: azureModal.workItemId.trim() };
      const res = await api.put(`/ai/stories/${azureModal.storyId}`, payload);
      const updated = res.data?.data;
      setStories((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setAzureModal({ open: false, storyId: null, workItemId: '' });
      setStatus({ type: 'success', message: 'Azure Work Item linked successfully' });
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to link Work Item';
      setStatus({ type: 'error', message: msg });
    }
  };

  const unlinkAzureWorkItem = async (storyId) => {
    try {
      const payload = { azure_work_item_id: null };
      const res = await api.put(`/ai/stories/${storyId}`, payload);
      const updated = res.data?.data;
      setStories((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setAzureModal({ open: false, storyId: null, workItemId: '' });
      setStatus({ type: 'success', message: 'Azure Work Item unlinked successfully' });
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to unlink Work Item';
      setStatus({ type: 'error', message: msg });
    }
  };

  const searchAzureWorkItem = async () => {
    if (!pullFromAzureModal.workItemId.trim()) {
      setStatus({ type: 'error', message: 'Please enter a Work Item ID' });
      return;
    }

    try {
      setPullFromAzureModal(prev => ({ ...prev, loading: true }));

      const workItem = await azureApi.getWorkItemById(pullFromAzureModal.workItemId.trim());

      // إذا كان Epic أو Feature، جلب الـ children
      let children = [];
      if (workItem.type === 'Epic' || workItem.type === 'Feature') {
        children = await azureApi.getWorkItemChildren(pullFromAzureModal.workItemId.trim());
      }

      setPullFromAzureModal(prev => ({
        ...prev,
        workItem,
        children,
        selectedChild: null,
        loading: false,
      }));
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Failed to fetch work item' });
      setPullFromAzureModal(prev => ({ ...prev, loading: false, workItem: null, children: [] }));
    }
  };

  const addPulledStory = async () => {
    try {
      if (!pullFromAzureModal.workItem) {
        setStatus({ type: 'error', message: 'No work item selected' });
        return;
      }

      // إذا كان Epic أو Feature واختار child
      let storyToAdd = pullFromAzureModal.workItem;
      if ((pullFromAzureModal.workItem.type === 'Epic' || pullFromAzureModal.workItem.type === 'Feature') && pullFromAzureModal.selectedChild) {
        const child = pullFromAzureModal.children.find(c => c.id === pullFromAzureModal.selectedChild);
        if (child) {
          storyToAdd = await azureApi.getWorkItemById(child.id);
        }
      }

      // Validate title
      if (!storyToAdd.title || storyToAdd.title.trim().length < 3) {
        setStatus({ type: 'error', message: 'Work item title must be at least 3 characters' });
        return;
      }

      // تحويل acceptance criteria من نص إلى array
      let acceptanceCriteria = [];
      if (storyToAdd.acceptanceCriteria && storyToAdd.acceptanceCriteria.trim()) {
        acceptanceCriteria = storyToAdd.acceptanceCriteria
          .split('\n')
          .map(c => c.trim())
          .filter(c => c && !c.startsWith('---'));
      }

      // تحديد الأولوية بشكل صحيح
      let priority = 'P3';
      if (storyToAdd.priority === '1' || storyToAdd.priority === 1) {
        priority = 'P1';
      } else if (storyToAdd.priority === '2' || storyToAdd.priority === 2) {
        priority = 'P2';
      }

      console.log('Adding pulled story:', {
        title: storyToAdd.title,
        priority,
        acceptanceCriteria,
        workItemId: storyToAdd.id,
      });

      // إنشاء story جديدة - مع الـ fields الصحيحة
      const newStory = {
        title: storyToAdd.title.trim(),
        description: storyToAdd.description ? storyToAdd.description.trim() : '',
        acceptanceCriteria: acceptanceCriteria,
        status: 'draft',
        priority,
      };

      console.log('Final payload:', newStory);

      const res = await api.post('/ai/stories/manual', newStory);
      const created = res.data?.data;

      if (created) {
        setStories(prev => [created, ...prev]);
      }

      setPullFromAzureModal({
        open: false,
        workItemId: '',
        loading: false,
        workItem: null,
        children: [],
        selectedChild: null,
      });

      setStatus({ type: 'success', message: `✅ Story "${storyToAdd.title}" added successfully!` });
    } catch (err) {
      console.error('Failed to add story:', err);
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to add story';
      console.error('Error details:', { status: err.response?.status, data: err.response?.data });
      setStatus({ type: 'error', message: msg });
    }
  };

  const saveAzureSettings = async () => {
    if (!azureSettingsModal.baseUrl.trim() || !azureSettingsModal.collection.trim() || !azureSettingsModal.project.trim()) {
      setStatus({ type: 'error', message: 'Please fill in all Azure settings' });
      return;
    }

    try {
      setAzureSettingsModal(prev => ({ ...prev, testing: true, testResult: null }));

      // تطبيق الإعدادات
      azureApi.setAzureConfig({
        baseUrl: azureSettingsModal.baseUrl,
        collection: azureSettingsModal.collection,
        project: azureSettingsModal.project,
      });

      // اختبار الاتصال
      const result = await azureApi.testAzureConnection();

      if (result.success) {
        setAzureSettingsModal(prev => ({
          ...prev,
          testing: false,
          testResult: { success: true, message: 'Azure settings saved and connected successfully!' }
        }));
        setStatus({ type: 'success', message: 'Azure settings saved successfully!' });
      } else {
        setAzureSettingsModal(prev => ({
          ...prev,
          testing: false,
          testResult: { success: false, message: result.error }
        }));
      }
    } catch (err) {
      setAzureSettingsModal(prev => ({
        ...prev,
        testing: false,
        testResult: { success: false, message: err.message }
      }));
    }
  };

  const testAzureConnection = async () => {
    if (!azurePatModal.patToken.trim()) {
      setStatus({ type: 'error', message: 'Please enter PAT token' });
      return;
    }

    setAzurePatModal(prev => ({ ...prev, testing: true, testResult: null }));

    try {
      azureApi.setAzurePAT(azurePatModal.patToken);
      const result = await azureApi.testAzureConnection();

      if (result.success) {
        localStorage.setItem('azure_pat', azurePatModal.patToken);
        setAzurePatModal(prev => ({
          ...prev,
          testing: false,
          testResult: { success: true, message: 'Connected to Azure DevOps successfully!' }
        }));
        setStatus({ type: 'success', message: 'Azure PAT configured successfully!' });
      } else {
        setAzurePatModal(prev => ({
          ...prev,
          testing: false,
          testResult: { success: false, message: result.error }
        }));
      }
    } catch (err) {
      setAzurePatModal(prev => ({
        ...prev,
        testing: false,
        testResult: { success: false, message: err.message }
      }));
    }
  };

  const loadAzureHierarchy = async () => {
    try {
      setAzurePushModal(prev => ({ ...prev, loading: true }));
      const hierarchy = await azureApi.getAzureHierarchy();

      setAzurePushModal(prev => ({
        ...prev,
        projects: [{ id: 'MOHU', name: 'MOHU' }], // Single project from config
        epics: hierarchy.epics,
        features: hierarchy.features,
        loading: false,
      }));
    } catch (err) {
      setStatus({ type: 'error', message: `Failed to load Azure data: ${err.message}` });
      setAzurePushModal(prev => ({ ...prev, loading: false }));
    }
  };

  const pushToAzure = async (storyId) => {
    const story = stories.find((s) => s.id === storyId);
    if (!story) return;

    try {
      // Get project name from Azure Settings
      const azureConfig = localStorage.getItem('azure_config');
      const projectName = azureConfig ? JSON.parse(azureConfig).project : 'MOHU';

      setAzurePushModal({
        open: true,
        storyId,
        storyTitle: story.title,
        selectedProject: projectName,
        selectedEpic: '',
        selectedFeature: '',
        newEpicName: '',
        newFeatureName: '',
        createNewEpic: false,
        createNewFeature: false,
        showConfirmation: false,
        tags: '',
        projects: [{ id: projectName, name: projectName }],
        epics: [],
        features: {},
        loading: true,
      });

      // Load existing Epics from Azure
      const existingEpics = await azureApi.getExistingEpics();
      setAzurePushModal(prev => ({
        ...prev,
        epics: existingEpics,
        loading: false,
      }));
    } catch (err) {
      console.error('Failed to load Epics:', err);
      setStatus({ type: 'error', message: `❌ Failed to load Azure Epics: ${err.message}` });
      setAzurePushModal(prev => ({ ...prev, loading: false, open: false }));
    }
  };

  const loadAzureEpics = async (projectId) => {
    setAzurePushModal((prev) => ({
      ...prev,
      selectedProject: projectId,
      selectedEpic: '',
      selectedFeature: '',
    }));
    // Epics already loaded via pushToAzure()
  };

  const loadAzureFeatures = async (epicId) => {
    if (!epicId) return;

    try {
      setAzurePushModal(prev => ({ ...prev, loading: true }));

      const features = await azureApi.getExistingFeatures(epicId);

      setAzurePushModal(prev => ({
        ...prev,
        features: {
          ...prev.features,
          [epicId]: features,
        },
        loading: false,
      }));
    } catch (err) {
      console.error('Failed to load Features:', err);
      setStatus({ type: 'error', message: `Failed to load Features: ${err.message}` });
      setAzurePushModal(prev => ({ ...prev, loading: false }));
    }
  };

  const submitAzurePush = async () => {
    const { storyId, selectedEpic, selectedFeature, createNewEpic, createNewFeature, newEpicName, newFeatureName, showConfirmation } = azurePushModal;

    // التحقق من Epic
    if (!createNewEpic && !selectedEpic) {
      setStatus({ type: 'error', message: 'Please select or create an Epic' });
      return;
    }
    if (createNewEpic && !newEpicName.trim()) {
      setStatus({ type: 'error', message: 'Please enter a name for the new Epic' });
      return;
    }

    // التحقق من Feature
    if (!createNewFeature && !selectedFeature) {
      setStatus({ type: 'error', message: 'Please select or create a Feature' });
      return;
    }
    if (createNewFeature && !newFeatureName.trim()) {
      setStatus({ type: 'error', message: 'Please enter a name for the new Feature' });
      return;
    }

    // عرض confirmation إذا لم يتم عرضه بعد
    if (!showConfirmation) {
      setAzurePushModal(prev => ({ ...prev, showConfirmation: true }));
      return;
    }

    try {
      setAzurePushModal((prev) => ({ ...prev, loading: true }));

      const story = stories.find(s => s.id === storyId);
      if (!story) return;

      let epicId = selectedEpic;
      let epicName = '';
      let featureId = selectedFeature;
      let featureName = '';

      // إنشاء Epic جديد إذا لزم الأمر
      if (createNewEpic && newEpicName.trim()) {
        setStatus({ type: 'info', message: `Creating Epic: ${newEpicName}...` });
        const newEpic = await azureApi.createAzureEpic(newEpicName);
        epicId = newEpic.id;
        epicName = newEpic.name;
      } else {
        // Get existing Epic name
        const epic = azurePushModal.epics.find(e => e.id === selectedEpic);
        epicName = epic ? epic.name : selectedEpic;
      }

      // إنشاء Feature جديدة إذا لزم الأمر
      if (createNewFeature && newFeatureName.trim()) {
        setStatus({ type: 'info', message: `Creating Feature: ${newFeatureName}...` });
        const newFeature = await azureApi.createAzureFeature(newFeatureName, epicId);
        featureId = newFeature.id;
        featureName = newFeature.name;
      } else {
        // Get existing Feature name
        const feature = azurePushModal.features[epicId]?.find(f => f.id === selectedFeature);
        featureName = feature ? feature.name : selectedFeature;
      }

      setStatus({ type: 'info', message: 'Creating User Story in Azure DevOps...' });

      // إنشاء User Story في Azure DevOps تحت Feature
      const azureStory = await azureApi.createAzureUserStory({
        title: story.title,
        description: story.description,
        acceptanceCriteria: parseCriteria(story.acceptance_criteria),
        priority: story.priority === 'P1' ? '1' : story.priority === 'P2' ? '2' : '3',
        areaPath: '', // Will be linked via parent relationship
        parentFeatureId: featureId, // Link to Feature
        tags: azurePushModal.tags,
      });

      // تحديث Story بـ Azure Work Item ID
      const workItemId = azureStory.id.toString();
      const payload = { azure_work_item_id: workItemId };
      const res = await api.put(`/ai/stories/${storyId}`, payload);
      const updated = res.data?.data;
      setStories((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));

      setAzurePushModal({
        open: false,
        storyId: null,
        storyTitle: '',
        selectedProject: '',
        selectedEpic: '',
        selectedFeature: '',
        newEpicName: '',
        newFeatureName: '',
        createNewEpic: false,
        createNewFeature: false,
        showConfirmation: false,
        tags: '',
        projects: [],
        epics: [],
        features: {},
        loading: false,
      });

      // Get project name from config
      const azureConfig = localStorage.getItem('azure_config');
      const projectName = azureConfig ? JSON.parse(azureConfig).project : 'Project';

      setStatus({ type: 'success', message: `✅ Story pushed to Azure DevOps successfully!\nProject: ${projectName} → Epic: ${epicName} → Feature: ${featureName} → Story #${workItemId}` });
    } catch (err) {
      const msg = err.message || 'Failed to push to Azure';
      setStatus({ type: 'error', message: `❌ ${msg}` });
      setAzurePushModal((prev) => ({ ...prev, loading: false, showConfirmation: false }));
    }
  };

  const pushSelectedToAzure = async () => {
    if (selectedStories.size === 0) {
      setStatus({ type: 'error', message: 'Select stories to push to Azure' });
      return;
    }

    // Filter stories that are not already linked to Azure
    const storiesToPush = stories.filter(s =>
      selectedStories.has(s.id) && (!s.azure_work_item_id || s.azure_work_item_id.trim() === '')
    );

    if (storiesToPush.length === 0) {
      setStatus({ type: 'error', message: 'All selected stories are already linked to Azure DevOps' });
      return;
    }

    // Get project name from Azure Settings
    const azureConfig = localStorage.getItem('azure_config');
    const projectName = azureConfig ? JSON.parse(azureConfig).project : 'MOHU';

    try {
      // Open bulk push modal and load Epics
      setBulkPushModal({
        open: true,
        step: 'config',
        selectedProject: projectName,
        selectedEpic: '',
        selectedFeature: '',
        newEpicName: '',
        newFeatureName: '',
        createNewEpic: false,
        createNewFeature: false,
        tags: '',
        epics: [],
        features: {},
        loading: true,
        currentIndex: 0,
        totalCount: storiesToPush.length,
        currentStory: null,
        progressLog: [],
        results: null,
      });

      // Load existing Epics
      const existingEpics = await azureApi.getExistingEpics();
      setBulkPushModal(prev => ({
        ...prev,
        epics: existingEpics,
        loading: false,
      }));
    } catch (err) {
      console.error('Failed to load Epics:', err);
      setStatus({ type: 'error', message: `❌ Failed to load Azure Epics: ${err.message}` });
      setAzurePushModal(prev => ({ ...prev, loading: false, open: false }));
    }
  };

  // Load features for selected Epic in bulk push modal
  const loadBulkPushFeatures = async (epicId) => {
    if (!epicId) return;

    try {
      setBulkPushModal(prev => ({ ...prev, loading: true }));

      const features = await azureApi.getExistingFeatures(epicId);

      setBulkPushModal(prev => ({
        ...prev,
        features: {
          ...prev.features,
          [epicId]: features,
        },
        loading: false,
      }));
    } catch (err) {
      console.error('Failed to load Features:', err);
      setStatus({ type: 'error', message: `Failed to load Features: ${err.message}` });
      setBulkPushModal(prev => ({ ...prev, loading: false }));
    }
  };

  // Execute bulk push
  const executeBulkPush = async () => {
    const { selectedEpic, selectedFeature, createNewEpic, createNewFeature, newEpicName, newFeatureName, tags } = bulkPushModal;

    // Validate Epic
    if (!createNewEpic && !selectedEpic) {
      setStatus({ type: 'error', message: 'Please select or create an Epic' });
      return;
    }
    if (createNewEpic && !newEpicName.trim()) {
      setStatus({ type: 'error', message: 'Please enter a name for the new Epic' });
      return;
    }

    // Validate Feature
    if (!createNewFeature && !selectedFeature) {
      setStatus({ type: 'error', message: 'Please select or create a Feature' });
      return;
    }
    if (createNewFeature && !newFeatureName.trim()) {
      setStatus({ type: 'error', message: 'Please enter a name for the new Feature' });
      return;
    }

    // Get stories to push
    const storiesToPush = stories.filter(s =>
      selectedStories.has(s.id) && (!s.azure_work_item_id || s.azure_work_item_id.trim() === '')
    );

    if (storiesToPush.length === 0) {
      setStatus({ type: 'error', message: 'No stories to push' });
      return;
    }

    // Switch to progress view
    setBulkPushModal(prev => ({
      ...prev,
      step: 'progress',
      loading: true,
      currentIndex: 0,
      totalCount: storiesToPush.length,
      progressLog: [],
    }));

    try {
      // Execute bulk push with progress callback
      const results = await azureApi.bulkPushToAzure(
        storiesToPush,
        {
          epicId: createNewEpic ? null : selectedEpic,
          featureId: createNewFeature ? null : selectedFeature,
          tags,
          createEpicIfNeeded: createNewEpic,
          newEpicName,
          createFeatureIfNeeded: createNewFeature,
          newFeatureName,
        },
        (current, total, story, result) => {
          // Progress callback
          setBulkPushModal(prev => ({
            ...prev,
            currentIndex: current,
            currentStory: story,
            progressLog: [
              ...prev.progressLog,
              {
                story,
                result,
                timestamp: new Date().toISOString(),
              },
            ],
          }));
        }
      );

      // Update local stories with Azure Work Item IDs
      for (const successItem of results.success) {
        const storyId = successItem.story.id;
        const workItemId = successItem.workItemId.toString();

        try {
          const res = await api.put(`/ai/stories/${storyId}`, { azure_work_item_id: workItemId });
          const updated = res.data?.data;
          if (updated) {
            setStories(prev => prev.map(s => s.id === updated.id ? updated : s));
          }
        } catch (updateErr) {
          console.error(`Failed to update local story ${storyId}:`, updateErr);
        }
      }

      // Show results
      setBulkPushModal(prev => ({
        ...prev,
        step: 'results',
        loading: false,
        results,
      }));

      // Clear selection
      setSelectedStories(new Set());

    } catch (err) {
      // Critical error (Epic/Feature creation failed)
      setStatus({ type: 'error', message: `❌ ${err.message}` });
      setBulkPushModal(prev => ({ ...prev, loading: false, step: 'config' }));
    }
  };

  // Close bulk push modal
  const closeBulkPushModal = () => {
    setBulkPushModal({
      open: false,
      step: 'config',
      selectedProject: '',
      selectedEpic: '',
      selectedFeature: '',
      newEpicName: '',
      newFeatureName: '',
      createNewEpic: false,
      createNewFeature: false,
      tags: '',
      epics: [],
      features: {},
      loading: false,
      currentIndex: 0,
      totalCount: 0,
      currentStory: null,
      progressLog: [],
      results: null,
    });
  };

  const pullFromAzure = async () => {
    const workItemId = prompt('Enter Azure Work Item ID to import:');
    if (!workItemId || !workItemId.trim()) return;

    try {
      // محاكاة جلب Story من Azure DevOps
      // في التطبيق الحقيقي، هنا هيكون API endpoint للـ backend
      const importedStory = {
        title: `Azure Work Item #${workItemId}`,
        description: `This story was imported from Azure DevOps Work Item #${workItemId}.\n\nDescription will be fetched from Azure.`,
        acceptanceCriteria: ['Acceptance criteria from Azure', 'Additional criteria'],
        priority: 'P2',
        status: 'ready',
        estimated_points: 5,
        business_value: 'High',
        azure_work_item_id: workItemId.trim(),
      };

      const res = await api.post('/ai/stories/manual', importedStory);
      const created = res.data?.data;
      setStories((prev) => [created, ...prev]);
      setStatus({ type: 'success', message: `Story imported from Azure Work Item #${workItemId}` });
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to import from Azure';
      setStatus({ type: 'error', message: msg });
    }
  };

  const cloneStories = async () => {
    if (selectedStories.size === 0) {
      setStatus({ type: 'error', message: 'Select stories to clone' });
      return;
    }
    try {
      const storiesToClone = stories.filter((s) => selectedStories.has(s.id));
      const clonedStories = storiesToClone.map((story) => ({
        title: `${story.title} (Clone)`,
        description: `${story.description}\n\n---\n*Cloned from AI Story Generator*`,
        acceptance_criteria: story.acceptance_criteria,
        priority: story.priority,
        status: 'draft',
        estimated_points: story.estimated_points,
        business_value: story.business_value,
      }));

      for (const cloned of clonedStories) {
        const res = await api.post('/ai/stories', cloned);
        setStories((prev) => [res.data?.data, ...prev]);
      }

      setSelectedStories(new Set());
      setStatus({ type: 'success', message: `${clonedStories.length} stories cloned` });
    } catch (err) {
      const msg = err.response?.data?.error || 'Clone failed';
      setStatus({ type: 'error', message: msg });
    }
  };

  const toggleStorySelection = (id) => {
    const next = new Set(selectedStories);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedStories(next);
  };

  const selectAllStories = () => {
    if (selectedStories.size === filteredAndSortedStories.length) {
      setSelectedStories(new Set());
    } else {
      setSelectedStories(new Set(filteredAndSortedStories.map((s) => s.id)));
    }
  };

  const submitRefine = async () => {
    if (!refineModal.feedback || refineModal.feedback.length < 10) {
      setStatus({ type: 'error', message: 'Provide feedback (min 10 chars).' });
      return;
    }
    try {
      const res = await api.post(`/ai/stories/${refineModal.storyId}/refine`, {
        feedback: refineModal.feedback,
      });
      const updated = res.data?.data;
      setStories((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setStatus({ type: 'success', message: 'Story refined' });
      setRefineModal({ open: false, storyId: null, feedback: '' });
    } catch (err) {
      const msg = err.response?.data?.error || 'Refine failed';
      setStatus({ type: 'error', message: msg });
    }
  };

  const handleEstimate = async (id) => {
    setEstimatingIds((prev) => new Set(prev).add(id));
    try {
      const res = await api.post('/ai/stories/estimate', { story_ids: [id] });
      const points = res.data?.data?.[id] ?? null;
      setStories((prev) => prev.map((s) => (s.id === id ? { ...s, estimated_points: points } : s)));
      setStatus({ type: 'success', message: 'Estimate updated' });
    } catch (err) {
      const msg = err.response?.data?.error || 'Estimation failed';
      setStatus({ type: 'error', message: msg });
    } finally {
      setEstimatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const renderedStories = useMemo(() => stories.map((story) => ({
    ...story,
    acceptance_criteria: parseCriteria(story.acceptance_criteria),
  })), [stories]);

  const filteredByGroup = useMemo(() => {
    if (!activeGroupId || activeGroupId === 'all') return renderedStories;
    return renderedStories.filter(s => String(s.group_id) === String(activeGroupId));
  }, [renderedStories, activeGroupId]);

  const filteredAndSortedStories = useMemo(() => {
    let filtered = filteredByGroup;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(s =>
        s.title.toLowerCase().includes(term) ||
        s.description?.toLowerCase().includes(term)
      );
    }

    // Priority filter
    if (filterPriority !== 'all') {
      filtered = filtered.filter(s => s.priority === filterPriority);
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(s => s.status === filterStatus);
    }

    // Azure DevOps filter
    if (filterAzure === 'with-azure') {
      filtered = filtered.filter(s => s.azure_work_item_id && s.azure_work_item_id.trim() !== '');
    } else if (filterAzure === 'without-azure') {
      filtered = filtered.filter(s => !s.azure_work_item_id || s.azure_work_item_id.trim() === '');
    }

    // Sorting
    const sorted = [...filtered];
    switch (sortBy) {
      case 'date-asc':
        sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case 'date-desc':
        sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      case 'priority':
        const priorityOrder = { 'P1': 0, 'P2': 1, 'P3': 2 };
        sorted.sort((a, b) => (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99));
        break;
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      default:
        break;
    }

    return sorted;
  }, [renderedStories, searchTerm, filterPriority, filterStatus, filterAzure, sortBy]);

  const showGlobalLoader = loadingStories || loadingTemplates || generating;

  const exportToJSON = () => {
    const dataStr = JSON.stringify(filteredAndSortedStories, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stories-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    setExportMenuOpen(false);
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Title', 'Description', 'Priority', 'Status', 'Story Points', 'Business Value', 'Created At'];
    const csvContent = [
      headers.join(','),
      ...filteredAndSortedStories.map(story => [
        story.id,
        `"${(story.title || '').replace(/"/g, '""')}"`,
        `"${(story.description || '').replace(/"/g, '""')}"`,
        story.priority || '',
        story.status || '',
        story.estimated_points || '',
        story.business_value || '',
        story.created_at || ''
      ].join(','))
    ].join('\n');

    const dataBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stories-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    setExportMenuOpen(false);
  };

  const exportToMarkdown = () => {
    let mdContent = `# User Stories Export\n\n**Exported:** ${new Date().toLocaleString()}\n**Total Stories:** ${filteredAndSortedStories.length}\n\n---\n\n`;

    filteredAndSortedStories.forEach((story, index) => {
      mdContent += `## ${index + 1}. ${story.title || 'Untitled'}\n\n`;
      mdContent += `- **Priority:** ${story.priority || 'N/A'}\n`;
      mdContent += `- **Status:** ${story.status || 'N/A'}\n`;
      mdContent += `- **Story Points:** ${story.estimated_points || 'Not estimated'}\n`;
      mdContent += `- **Business Value:** ${story.business_value || 'N/A'}\n`;
      mdContent += `- **Created:** ${formatDate(story.created_at)}\n\n`;
      mdContent += `### Description\n\n${story.description || 'No description'}\n\n`;

      const acceptanceCriteria = parseCriteria(story.acceptance_criteria);
      if (acceptanceCriteria.length > 0) {
        mdContent += `### Acceptance Criteria\n\n`;
        acceptanceCriteria.forEach(criterion => {
          mdContent += `- [ ] ${criterion}\n`;
        });
        mdContent += `\n`;
      }

      mdContent += `---\n\n`;
    });

    const dataBlob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stories-${new Date().toISOString().split('T')[0]}.md`;
    link.click();
    setExportMenuOpen(false);
  };

  const exportStories = exportToJSON; // للتوافق مع الكود القديم

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Stories are displayed in flat list
  const displayStories = filteredAndSortedStories;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        {showGlobalLoader && (
          <div className="fixed inset-0 z-9999 flex items-center justify-center bg-[#0b2b4c]/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 shadow-2xl border border-[#ff9f1c]/30 w-80 text-center space-y-4">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border-[6px] border-[#ff9f1c]/70 border-t-transparent animate-spin" />
                <div className="absolute inset-3 rounded-full bg-[#0b2b4c] flex items-center justify-center text-3xl text-[#ff9f1c] shadow-inner">
                  🦇
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold text-[#0b2b4c]">Loading stories</p>
                <p className="text-sm text-gray-600">Brand mode · please wait</p>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-[#0b2b4c] rounded-lg">
                    <Sparkles size={24} className="text-white" />
                  </div>
                  <h1 className="text-4xl font-bold text-[#0b2b4c]">AI Story Generator</h1>
                </div>
                <p className="text-base text-gray-700 ml-11">Generate, refine, and manage user stories with AI-powered assistance.</p>
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
                  onClick={() => setAddModal({ open: true, mode: 'selection' })}
                  className="btn flex items-center gap-2 transition-all duration-200 px-5 py-2.5 rounded-lg font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 bg-[#0b2b4c] text-white border-0 hover:bg-[#0b2b4c]/90"
                >
                  <Plus size={20} />
                  Add Story
                </button>

                <button
                  onClick={loadStories}
                  className="btn flex items-center gap-2 transition-all duration-200 px-4 py-2.5 rounded-lg font-semibold border-2 border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                  disabled={loadingStories}
                >
                  <RefreshCw size={18} className={loadingStories ? 'animate-spin' : ''} />
                  Refresh
                </button>

                {/* Export Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                    className="btn flex items-center gap-2 transition-all duration-200 px-4 py-2.5 rounded-lg font-semibold border-2 border-[#0b2b4c] text-[#0b2b4c] bg-white hover:bg-gray-50"
                    disabled={filteredAndSortedStories.length === 0}
                  >
                    <Download size={18} />
                    Export
                    <ChevronDown size={16} className={`transition-transform duration-200 ${exportMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {exportMenuOpen && (
                    <>
                      {/* Backdrop to close menu */}
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setExportMenuOpen(false)}
                      />

                      {/* Dropdown Menu */}
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-20">
                        <button
                          onClick={exportToJSON}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                        >
                          <FileJson size={18} className="text-blue-600" />
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">Export as JSON</p>
                            <p className="text-xs text-gray-500">Full data structure</p>
                          </div>
                        </button>

                        <button
                          onClick={exportToCSV}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                        >
                          <FileSpreadsheet size={18} className="text-green-600" />
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">Export as CSV</p>
                            <p className="text-xs text-gray-500">Excel compatible</p>
                          </div>
                        </button>

                        <button
                          onClick={exportToMarkdown}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                        >
                          <FileText size={18} className="text-purple-600" />
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">Export as Markdown</p>
                            <p className="text-xs text-gray-500">Documentation ready</p>
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Status Messages */}
          {status && (
            <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-[9999] p-4 rounded-lg border-l-4 text-sm font-medium transition-all duration-300 shadow-2xl max-w-md ${status.type === 'error'
              ? 'border-l-red-500 bg-red-50 text-red-700 border border-red-200'
              : 'border-l-green-500 bg-green-50 text-green-700 border border-green-200'
              }`}>
              <div className="flex items-start gap-3">
                {status.type === 'error' ? (
                  <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                ) : (
                  <Check size={20} className="flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 whitespace-pre-line">{status.message}</div>
              </div>
            </div>
          )}

          {/* Search & Filters - Clean Layout */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm mb-4">
            {/* Row 1: Search Only */}
            <div className="mb-3">
              {/* Search */}
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search stories..."
                className="input w-full bg-gray-50 border border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg text-sm py-2 px-3"
              />
            </div>

            {/* Row 2: Filters + Select All */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {/* Sort By */}
              <div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="input w-full bg-gray-50 border border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg text-sm py-2 px-3"
                >
                  <option value="date-desc">Latest First</option>
                  <option value="date-asc">Oldest First</option>
                  <option value="priority">By Priority</option>
                  <option value="title">By Title (A-Z)</option>
                </select>
              </div>

              {/* Priority */}
              <div>
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="input w-full bg-gray-50 border border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg text-sm py-2 px-3"
                >
                  <option value="all">All Priorities</option>
                  <option value="P1">Critical (P1)</option>
                  <option value="P2">High (P2)</option>
                  <option value="P3">Low (P3)</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="input w-full bg-gray-50 border border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg text-sm py-2 px-3"
                >
                  <option value="all">All Status</option>
                  <option value="draft">Draft</option>
                  <option value="ready">Ready</option>
                  <option value="in-progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>

              {/* Azure DevOps Filter */}
              <div>
                <select
                  value={filterAzure}
                  onChange={(e) => setFilterAzure(e.target.value)}
                  className="input w-full bg-gray-50 border border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg text-sm py-2 px-3"
                >
                  <option value="all">All (Azure)</option>
                  <option value="with-azure">With Azure</option>
                  <option value="without-azure">Without Azure</option>
                </select>
              </div>

              {/* Select All */}
              <button
                onClick={selectAllStories}
                className="px-4 py-2 rounded-lg bg-[#ff9f1c] text-[#0b2b4c] hover:bg-[#e68c17] transition-all duration-200 border-0 font-bold text-sm shadow-sm hover:shadow-md flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <input
                  type="checkbox"
                  checked={selectedStories.size === filteredAndSortedStories.length && filteredAndSortedStories.length > 0}
                  onChange={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded cursor-pointer"
                />
                <span>{selectedStories.size === filteredAndSortedStories.length && filteredAndSortedStories.length > 0 ? 'Clear' : 'Select All'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Stories Section */}
            <div className="space-y-3">
              {/* Header with Count */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#0b2b4c] rounded-lg">
                    <MessageSquare size={18} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#0b2b4c]">Stories</h2>
                    <p className="text-xs text-gray-500">{loadingStories ? 'Loading...' : `${filteredAndSortedStories.length} of ${stories.length}`}</p>
                  </div>
                </div>
              </div>

              {/* Bulk Actions - Enhanced */}
              {selectedStories.size > 0 && (
                <div className="bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-300 px-5 py-3 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">✓</span>
                    <p className="text-sm font-bold text-amber-900">
                      {selectedStories.size} {selectedStories.size === 1 ? 'story' : 'stories'} selected
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={pushSelectedToAzure}
                      className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md"
                    >
                      <Zap size={14} />
                      Push to Azure
                    </button>
                    <button
                      onClick={() => {
                        const ids = Array.from(selectedStories);
                        const textToCopy = stories.filter(s => ids.includes(s.id)).map(s => `${s.title}\n${s.description || ''}`).join('\n---\n');
                        navigator.clipboard.writeText(textToCopy);
                        setStatus({ type: 'success', message: `${selectedStories.size} stories copied` });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md"
                    >
                      <Copy size={14} />
                      Copy Text
                    </button>
                    <button
                      onClick={cloneStories}
                      className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md"
                    >
                      <Plus size={14} />
                      Clone
                    </button>
                    <button
                      onClick={deleteSelectedStories}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {/* Stories List */}
              {loadingStories ? (
                <div className="card p-10 text-center bg-white rounded-lg border border-gray-200 shadow-sm">
                  <div className="flex justify-center mb-3">
                    <div className="p-3 bg-blue-100 rounded-full">
                      <RefreshCw size={24} className="text-blue-600 animate-spin" />
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 font-semibold">Loading stories...</p>
                </div>
              ) : filteredAndSortedStories.length === 0 ? (
                <div className="card p-10 text-center bg-white border-2 border-dashed border-gray-300 rounded-lg">
                  <div className="flex justify-center mb-3">
                    <div className="text-3xl">📭</div>
                  </div>
                  <p className="text-gray-700 font-semibold text-sm mb-1">No stories found</p>
                  <p className="text-xs text-gray-500">Try adjusting your search or filters.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAndSortedStories.map((story) => (
                    <div key={story.id} className="card bg-white border border-gray-200 hover:border-[#ff9f1c] hover:shadow-md transition-all duration-300 rounded-lg overflow-hidden group">
                      {/* Accordion Header with Checkbox */}
                      <div className="w-full px-5 py-3.5 flex items-center gap-3 bg-gray-50 group-hover:bg-gray-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedStories.has(story.id)}
                          onChange={() => toggleStorySelection(story.id)}
                          className="w-4 h-4 rounded border-gray-300 text-[#ff9f1c] focus:ring-[#ff9f1c] cursor-pointer flex-shrink-0"
                        />

                        <div
                          onClick={() => setExpandedStory(expandedStory === story.id ? null : story.id)}
                          className="flex-1 flex items-center gap-3 text-left hover:opacity-50 transition-opacity cursor-pointer"
                        >
                          <div className={`flex-shrink-0 transition-transform text-gray-400 ${expandedStory === story.id ? 'rotate-180' : ''}`}>
                            {expandedStory === story.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-base font-semibold text-gray-900 truncate">{story.title}</h3>
                              {story.generated_by_ai && (
                                <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full whitespace-nowrap">✨ AI</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 line-clamp-1">{story.description}</p>
                          </div>

                          <div className="flex-shrink-0 flex items-center gap-2">
                            {story.azure_work_item_id && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAzureModal({ open: true, storyId: story.id, workItemId: story.azure_work_item_id });
                                }}
                                className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200 transition-colors"
                                title={`Azure Work Item: ${story.azure_work_item_id}`}
                              >
                                ☁️ #{story.azure_work_item_id}
                              </span>
                            )}
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${story.priority === 'P1' ? 'bg-red-100 text-red-700' :
                              story.priority === 'P2' ? 'bg-amber-100 text-amber-700' :
                                'bg-emerald-100 text-emerald-700'
                              }`}>
                              {story.priority || 'P2'}
                            </span>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${story.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                              story.status === 'ready' ? 'bg-blue-100 text-blue-700' :
                                story.status === 'in-progress' ? 'bg-purple-100 text-purple-700' :
                                  'bg-green-100 text-green-700'
                              }`}>
                              {story.status || 'draft'}
                            </span>

                            {/* Hover Actions */}
                            <div className="flex items-center gap-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              {!story.azure_work_item_id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    pushToAzure(story.id);
                                  }}
                                  className="p-1.5 rounded-lg bg-sky-50 text-sky-600 hover:bg-sky-100 transition-all duration-200 hover:shadow-sm hover:scale-105"
                                  title="Push to Azure DevOps"
                                >
                                  <Zap size={16} />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyStory(story);
                                }}
                                className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all duration-200 hover:shadow-sm hover:scale-105"
                                title="Copy story"
                              >
                                <Copy size={16} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteStory(story.id);
                                }}
                                className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-all duration-200 hover:shadow-sm hover:scale-105"
                                title="Delete story"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Accordion Content */}
                      {expandedStory === story.id && (
                        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50 space-y-4">
                          {/* Meta Info */}
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-2 text-gray-600">
                              <Calendar size={16} />
                              <span>{formatDate(story.created_at)}</span>
                            </div>
                            {story.estimated_points !== undefined && story.estimated_points !== null && (
                              <div className="flex items-center gap-2 text-gray-600">
                                <Calculator size={16} />
                                <span className="font-semibold">{story.estimated_points} pts</span>
                              </div>
                            )}
                            {story.business_value && (
                              <div className="text-gray-600">
                                <span className="font-semibold">BV: {story.business_value}</span>
                              </div>
                            )}
                          </div>

                          {/* Full Description */}
                          {story.description && (
                            <div>
                              <p className="text-sm font-semibold text-gray-900 mb-2">Description</p>
                              <p className="text-sm text-gray-700 leading-relaxed">{story.description}</p>
                            </div>
                          )}

                          {/* Acceptance Criteria */}
                          {story.acceptance_criteria && story.acceptance_criteria.length > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                              <p className="text-sm font-semibold text-gray-900">✓ Acceptance Criteria</p>
                              <ul className="space-y-1.5 text-sm text-gray-700">
                                {story.acceptance_criteria.map((c, idx) => (
                                  <li key={idx} className="flex gap-2">
                                    <span className="text-blue-600 font-bold">•</span>
                                    <span>{c}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex flex-wrap gap-2 pt-2">
                            <button
                              className="btn btn-secondary flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-all duration-200 hover:shadow-md bg-[#0b2b4c]/10 text-[#0b2b4c] border border-[#0b2b4c]/30 hover:bg-[#0b2b4c]/15"
                              onClick={() => {
                                setDetailsModal({ open: true, story });
                                setExpandedStory(null);
                              }}
                            >
                              <Eye size={16} /> View Details
                            </button>
                            <button
                              className="btn flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-all duration-200 hover:shadow-md bg-[#ff9f1c]/15 text-[#c96a00] border border-[#ff9f1c]/50 hover:bg-[#ff9f1c]/25"
                              onClick={() => handleEstimate(story.id)}
                              disabled={estimatingIds.has(story.id)}
                            >
                              <Calculator size={16} /> {estimatingIds.has(story.id) ? 'Estimating...' : 'Estimate'}
                            </button>
                            <button
                              className="btn flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-all duration-200 hover:shadow-md bg-[#0b2b4c]/10 text-[#0b2b4c] border border-[#0b2b4c]/20 hover:bg-[#0b2b4c]/15"
                              onClick={() => openRefine(story.id)}
                            >
                              <MessageSquare size={16} /> Refine
                            </button>
                            <button
                              className="btn flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-all duration-200 hover:shadow-md bg-[#ff9f1c]/10 text-[#0b2b4c] border border-[#ff9f1c]/40 hover:bg-[#ff9f1c]/20"
                              onClick={() => openManualModal(story)}
                            >
                              <Edit2 size={16} /> Edit
                            </button>
                            <button
                              className="btn flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-all duration-200 hover:shadow-md bg-red-50 text-red-700 border border-red-300 hover:bg-red-100 ml-auto"
                              onClick={() => deleteStory(story.id)}
                            >
                              <Trash2 size={16} /> Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Story Details Modal */}
      <Modal
        isOpen={detailsModal.open}
        onClose={() => setDetailsModal({ open: false, story: null })}
        title={detailsModal.story ? `📖 ${detailsModal.story.title}` : ''}
      >
        {detailsModal.story && (
          <div className="space-y-6">
            {/* Status & Priority */}
            <div className="flex flex-wrap gap-3">
              <span className={`px-4 py-2 rounded-lg text-sm font-semibold ${detailsModal.story.priority === 'P1' ? 'bg-red-100 text-red-700' :
                detailsModal.story.priority === 'P2' ? 'bg-amber-100 text-amber-700' :
                  'bg-emerald-100 text-emerald-700'
                }`}>
                {detailsModal.story.priority} Priority
              </span>
              <span className={`px-4 py-2 rounded-lg text-sm font-semibold ${detailsModal.story.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                detailsModal.story.status === 'ready' ? 'bg-blue-100 text-blue-700' :
                  detailsModal.story.status === 'in-progress' ? 'bg-purple-100 text-purple-700' :
                    'bg-green-100 text-green-700'
                }`}>
                {detailsModal.story.status}
              </span>
              {detailsModal.story.generated_by_ai && (
                <span className="px-4 py-2 rounded-lg bg-purple-100 text-purple-700 text-sm font-semibold">
                  ✨ AI Generated
                </span>
              )}
            </div>

            {/* Description */}
            <div>
              <h3 className="font-bold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-700 leading-relaxed">{detailsModal.story.description || 'No description'}</p>
            </div>

            {/* Acceptance Criteria */}
            {detailsModal.story.acceptance_criteria && detailsModal.story.acceptance_criteria.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <h3 className="font-bold text-gray-900">✓ Acceptance Criteria</h3>
                <ul className="space-y-2 text-gray-700">
                  {detailsModal.story.acceptance_criteria.map((c, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="text-blue-600 font-bold">•</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-600 mb-1">Story Points</p>
                <p className="text-2xl font-bold text-gray-900">
                  {detailsModal.story.estimated_points ?? 'Not estimated'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-600 mb-1">Business Value</p>
                <p className="text-2xl font-bold text-gray-900">
                  {detailsModal.story.business_value || 'N/A'}
                </p>
              </div>
            </div>

            {/* Meta Info */}
            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Created:</span> {formatDate(detailsModal.story.created_at)}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                className="flex-1 btn bg-[#0b2b4c]/10 text-[#0b2b4c] border border-[#0b2b4c]/30 hover:bg-[#0b2b4c]/15 rounded-lg py-2 font-semibold transition-all"
                onClick={() => {
                  setDetailsModal({ open: false, story: null });
                  openManualModal(detailsModal.story);
                }}
              >
                <Edit2 size={16} className="mr-2" /> Edit
              </button>
              <button
                className="flex-1 btn bg-red-50 text-red-700 border border-red-300 hover:bg-red-100 rounded-lg py-2 font-semibold transition-all"
                onClick={() => {
                  deleteStory(detailsModal.story.id);
                  setDetailsModal({ open: false, story: null });
                }}
              >
                <Trash2 size={16} className="mr-2" /> Delete
              </button>
              <button
                className="flex-1 btn btn-light border border-[#0b2b4c]/20 text-[#0b2b4c] hover:bg-gray-100 rounded-lg py-2 font-semibold transition-all"
                onClick={() => setDetailsModal({ open: false, story: null })}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Refine Modal */}
      <Modal
        isOpen={refineModal.open}
        onClose={() => setRefineModal({ open: false, storyId: null, feedback: '' })}
        title="🔧 Refine Story"
      >
        <div className="space-y-4">
          <div className="p-4 bg-[#f6f8fb] border border-[#e4e9f2] rounded-lg">
            <p className="text-sm text-gray-700 font-medium leading-relaxed">Provide specific feedback or constraints to improve this story and let AI refine it based on your input.</p>
          </div>
          <div>
            <label className="label font-semibold text-gray-900 mb-2 block">Feedback or Improvements</label>
            <textarea
              value={refineModal.feedback}
              onChange={(e) => setRefineModal((prev) => ({ ...prev, feedback: e.target.value }))}
              className="input resize-none h-32 bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
              placeholder="Add clarity on requirements, mention edge cases, define boundaries, specify constraints..."
            />
            <p className="text-xs text-gray-500 mt-2 font-medium">Minimum 10 characters</p>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              className="btn btn-light px-4 py-2 rounded-lg transition-all duration-200 border border-gray-300 hover:bg-gray-100"
              onClick={() => setRefineModal({ open: false, storyId: null, feedback: '' })}
            >
              Cancel
            </button>
            <button
              className="btn bg-[#ff9f1c] text-[#0b2b4c] px-4 py-2 rounded-lg transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-0 hover:bg-[#e68c17]"
              onClick={submitRefine}
            >
              Apply Refinement
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={manualModal.open}
        onClose={() => setManualModal({ open: false, editingId: null })}
        title={manualModal.editingId ? '✏️ Edit Story' : '➕ Create New Story'}
      >
        <div className="space-y-5">
          {/* Title */}
          <div>
            <label className="label font-semibold text-gray-900 mb-2 block">Title *</label>
            <input
              className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
              value={manualForm.title}
              onChange={(e) => setManualForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Enter a clear, concise story title"
            />
            <p className="text-xs text-gray-500 mt-1 font-medium">Required field</p>
          </div>

          {/* Description */}
          <div>
            <label className="label font-semibold text-gray-900 mb-2 block">Description</label>
            <textarea
              className="input h-24 w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg resize-none"
              value={manualForm.description}
              onChange={(e) => setManualForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Describe the user story, actors, and requirements"
            />
          </div>

          {/* Acceptance Criteria */}
          <div>
            <label className="label font-semibold text-gray-900 mb-2 block">Acceptance Criteria</label>
            <textarea
              className="input h-24 w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg resize-none"
              value={manualForm.acceptanceCriteria}
              onChange={(e) => setManualForm((p) => ({ ...p, acceptanceCriteria: e.target.value }))}
              placeholder="One criterion per line&#10;Example:&#10;• User can login with email&#10;• Session persists after refresh"
            />
            <p className="text-xs text-gray-500 mt-1 font-medium">One per line</p>
          </div>

          {/* Priority & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label font-semibold text-gray-900 mb-2 block">Priority</label>
              <select
                className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
                value={manualForm.priority}
                onChange={(e) => setManualForm((p) => ({ ...p, priority: e.target.value }))}
              >
                <option value="P1">🔴 P1 - Critical</option>
                <option value="P2">🟡 P2 - High</option>
                <option value="P3">🟢 P3 - Low</option>
              </select>
            </div>
            <div>
              <label className="label font-semibold text-gray-900 mb-2 block">Status</label>
              <select
                className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
                value={manualForm.status}
                onChange={(e) => setManualForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="draft">📝 Draft</option>
                <option value="ready">✅ Ready</option>
                <option value="in-progress">🚀 In Progress</option>
                <option value="done">🎉 Done</option>
              </select>
            </div>
          </div>

          {/* Story Points & Business Value */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label font-semibold text-gray-900 mb-2 block">Story Points</label>
              <input
                className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
                type="number"
                value={manualForm.estimated_points}
                onChange={(e) => setManualForm((p) => ({ ...p, estimated_points: e.target.value }))}
                placeholder="e.g., 5, 8, 13"
              />
            </div>
            <div>
              <label className="label font-semibold text-gray-900 mb-2 block">Business Value</label>
              <input
                className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
                value={manualForm.business_value}
                onChange={(e) => setManualForm((p) => ({ ...p, business_value: e.target.value }))}
                placeholder="e.g., High, Medium, Low"
              />
            </div>
          </div>

          {/* Tags & Azure Work Item */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label font-semibold text-gray-900 mb-2 block">Tags</label>
              <input
                className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
                value={manualForm.tags}
                onChange={(e) => setManualForm((p) => ({ ...p, tags: e.target.value }))}
                placeholder="e.g., frontend, urgent, v2.0"
              />
            </div>
            <div>
              <label className="label font-semibold text-gray-900 mb-2 block">☁️ Azure Work Item ID</label>
              <input
                className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
                value={manualForm.azure_work_item_id}
                onChange={(e) => setManualForm((p) => ({ ...p, azure_work_item_id: e.target.value }))}
                placeholder="e.g., 1234"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              className="btn btn-light px-4 py-2 rounded-lg transition-all duration-200 border border-gray-300 hover:bg-gray-100"
              onClick={() => setManualModal({ open: false, editingId: null })}
            >
              Cancel
            </button>
            <button
              className="btn bg-[#ff9f1c] text-[#0b2b4c] px-4 py-2 rounded-lg transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-0 hover:bg-[#e68c17]"
              onClick={saveManualStory}
            >
              {manualModal.editingId ? '💾 Update Story' : '➕ Create Story'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Azure DevOps Link Modal */}
      <Modal
        isOpen={azureModal.open}
        onClose={() => setAzureModal({ open: false, storyId: null, workItemId: '' })}
        title="☁️ Azure DevOps Link"
      >
        <div className="space-y-5">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900 font-medium leading-relaxed">
              Link this user story to an existing Azure DevOps Work Item by entering its ID.
            </p>
          </div>

          <div>
            <label className="label font-semibold text-gray-900 mb-2 block">Work Item ID</label>
            <input
              className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
              value={azureModal.workItemId}
              onChange={(e) => setAzureModal((prev) => ({ ...prev, workItemId: e.target.value }))}
              placeholder="Enter Azure Work Item ID (e.g., 1234)"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-2 font-medium">Enter the numeric ID of the Azure DevOps Work Item</p>
          </div>

          <div className="flex justify-between gap-3 pt-4 border-t border-gray-200">
            <div>
              {azureModal.workItemId && (
                <button
                  className="btn px-4 py-2 rounded-lg transition-all duration-200 bg-red-50 text-red-700 border border-red-300 hover:bg-red-100 font-semibold"
                  onClick={() => unlinkAzureWorkItem(azureModal.storyId)}
                >
                  🔗 Unlink Work Item
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                className="btn btn-light px-4 py-2 rounded-lg transition-all duration-200 border border-gray-300 hover:bg-gray-100"
                onClick={() => setAzureModal({ open: false, storyId: null, workItemId: '' })}
              >
                Cancel
              </button>
              <button
                className="btn bg-[#ff9f1c] text-[#0b2b4c] px-5 py-2 rounded-lg transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-0 hover:bg-[#e68c17] font-semibold"
                onClick={linkAzureWorkItem}
              >
                ☁️ Link Work Item
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Azure Settings Modal */}
      <Modal
        isOpen={azureSettingsModal.open}
        onClose={() => setAzureSettingsModal({
          open: false,
          baseUrl: azureSettingsModal.baseUrl,
          collection: azureSettingsModal.collection,
          project: azureSettingsModal.project,
          testing: false,
          testResult: null,
        })}
        title="⚙️ Azure DevOps Settings"
      >
        <div className="space-y-5">
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg space-y-3">
            <div className="flex gap-2">
              <AlertCircle size={20} className="text-purple-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-purple-900 font-semibold mb-1">Configure Azure DevOps Connection</p>
                <p className="text-xs text-purple-800 leading-relaxed">
                  Set your Azure DevOps instance details. These settings are stored securely in browser storage.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="label font-semibold text-gray-900 mb-2 block">Base URL</label>
            <input
              type="text"
              className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg font-mono text-sm"
              value={azureSettingsModal.baseUrl}
              onChange={(e) => setAzureSettingsModal(prev => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="e.g., https://azure.2p.com.sa/"
            />
            <p className="text-xs text-gray-500 mt-1 font-medium">Your Azure DevOps server URL (with trailing slash)</p>
          </div>

          <div>
            <label className="label font-semibold text-gray-900 mb-2 block">Collection Name</label>
            <input
              type="text"
              className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
              value={azureSettingsModal.collection}
              onChange={(e) => setAzureSettingsModal(prev => ({ ...prev, collection: e.target.value }))}
              placeholder="e.g., Projects"
            />
            <p className="text-xs text-gray-500 mt-1 font-medium">Collection name in your Azure DevOps</p>
          </div>

          <div>
            <label className="label font-semibold text-gray-900 mb-2 block">Project Name</label>
            <input
              type="text"
              className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
              value={azureSettingsModal.project}
              onChange={(e) => setAzureSettingsModal(prev => ({ ...prev, project: e.target.value }))}
              placeholder="e.g., MOHU"
            />
            <p className="text-xs text-gray-500 mt-1 font-medium">Project name to push stories to</p>
          </div>

          {azureSettingsModal.testResult && (
            <div className={`p-3 rounded-lg flex gap-2 ${azureSettingsModal.testResult.success
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
              }`}>
              {azureSettingsModal.testResult.success ? (
                <Check size={18} className="text-green-700 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={18} className="text-red-700 flex-shrink-0 mt-0.5" />
              )}
              <p className={`text-sm font-semibold ${azureSettingsModal.testResult.success ? 'text-green-900' : 'text-red-900'
                }`}>
                {azureSettingsModal.testResult.message}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              className="btn btn-light px-4 py-2 rounded-lg transition-all duration-200 border border-gray-300 hover:bg-gray-100"
              onClick={() => setAzureSettingsModal({
                open: false,
                baseUrl: azureSettingsModal.baseUrl,
                collection: azureSettingsModal.collection,
                project: azureSettingsModal.project,
                testing: false,
                testResult: null,
              })}
              disabled={azureSettingsModal.testing}
            >
              Cancel
            </button>
            <button
              className="btn bg-[#ff9f1c] text-[#0b2b4c] px-5 py-2 rounded-lg transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-0 hover:bg-[#e68c17] font-semibold"
              onClick={saveAzureSettings}
              disabled={!azureSettingsModal.baseUrl.trim() || !azureSettingsModal.collection.trim() || !azureSettingsModal.project.trim() || azureSettingsModal.testing}
            >
              {azureSettingsModal.testing ? 'Testing...' : '✓ Save Settings'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Azure PAT Configuration Modal */}
      <Modal
        isOpen={azurePatModal.open}
        onClose={() => setAzurePatModal({ open: false, patToken: '', testing: false, testResult: null })}
        title="🔐 Azure DevOps PAT Configuration"
      >
        <div className="space-y-5">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
            <div className="flex gap-2">
              <AlertCircle size={20} className="text-blue-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-blue-900 font-semibold mb-1">Personal Access Token Required</p>
                <p className="text-xs text-blue-800 leading-relaxed">
                  Enter your Azure DevOps PAT token to enable push to Azure. Your token is stored securely in browser storage.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="label font-semibold text-gray-900 mb-2 block">PAT Token</label>
            <input
              type="password"
              className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg font-mono text-sm"
              value={azurePatModal.patToken}
              onChange={(e) => setAzurePatModal(prev => ({ ...prev, patToken: e.target.value }))}
              placeholder="paste your PAT token here"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-2 font-medium">
              Get token from: https://dev.azure.com → User Settings → Personal access tokens
            </p>
          </div>

          {azurePatModal.testResult && (
            <div className={`p-3 rounded-lg flex gap-2 ${azurePatModal.testResult.success
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
              }`}>
              {azurePatModal.testResult.success ? (
                <Check size={18} className="text-green-700 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={18} className="text-red-700 flex-shrink-0 mt-0.5" />
              )}
              <p className={`text-sm font-semibold ${azurePatModal.testResult.success ? 'text-green-900' : 'text-red-900'
                }`}>
                {azurePatModal.testResult.message}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              className="btn btn-light px-4 py-2 rounded-lg transition-all duration-200 border border-gray-300 hover:bg-gray-100"
              onClick={() => setAzurePatModal({ open: false, patToken: '', testing: false, testResult: null })}
              disabled={azurePatModal.testing}
            >
              Cancel
            </button>
            <button
              className="btn bg-blue-600 text-white px-4 py-2 rounded-lg transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-0 hover:bg-blue-700 font-semibold"
              onClick={testAzureConnection}
              disabled={!azurePatModal.patToken.trim() || azurePatModal.testing}
            >
              {azurePatModal.testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              className="btn bg-[#ff9f1c] text-[#0b2b4c] px-5 py-2 rounded-lg transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-0 hover:bg-[#e68c17] font-semibold"
              onClick={() => {
                localStorage.setItem('azure_pat', azurePatModal.patToken);
                azureApi.setAzurePAT(azurePatModal.patToken);
                setStatus({ type: 'success', message: 'Azure PAT saved successfully' });
                setAzurePatModal({ open: false, patToken: '', testing: false, testResult: null });
              }}
              disabled={!azurePatModal.patToken.trim() || !azurePatModal.testResult?.success}
            >
              ✓ Save
            </button>
          </div>
        </div>
      </Modal>

      {/* Azure DevOps Push Modal */}
      <Modal
        isOpen={azurePushModal.open}
        onClose={() => setAzurePushModal({
          open: false,
          storyId: null,
          storyTitle: '',
          selectedProject: '',
          selectedEpic: '',
          selectedFeature: '',
          newEpicName: '',
          newFeatureName: '',
          createNewEpic: false,
          createNewFeature: false,
          showConfirmation: false,
          tags: '',
          projects: [],
          epics: [],
          features: [],
          loading: false,
        })}
        title="🚀 Push to Azure DevOps"
      >
        <div className="space-y-5">
          {/* Story Info */}
          <div className="p-4 bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-lg">
            <p className="text-xs text-sky-700 font-semibold mb-1">USER STORY</p>
            <p className="text-sm text-sky-900 font-bold leading-relaxed">
              {azurePushModal.storyTitle}
            </p>
          </div>

          {azurePushModal.loading ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#ff9f1c] border-t-transparent"></div>
              <p className="text-sm text-gray-600 font-medium">Processing...</p>
            </div>
          ) : azurePushModal.showConfirmation ? (
            /* Confirmation Screen */
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-lg shadow-md">
                <h3 className="text-lg font-bold text-amber-900 mb-3 flex items-center gap-2">
                  <AlertCircle size={22} className="text-amber-600" />
                  Confirm Push to Azure DevOps
                </h3>
                <div className="space-y-2 text-sm text-amber-900">
                  <p><span className="font-semibold">📁 Project:</span> {azurePushModal.selectedProject}</p>
                  <p>
                    <span className="font-semibold">📊 Epic:</span> {
                      azurePushModal.createNewEpic
                        ? `🆕 Create New: "${azurePushModal.newEpicName}"`
                        : azurePushModal.epics.find(e => e.id === azurePushModal.selectedEpic)?.name || azurePushModal.selectedEpic
                    }
                  </p>
                  <p>
                    <span className="font-semibold">🎯 Feature:</span> {
                      azurePushModal.createNewFeature
                        ? `🆕 Create New: "${azurePushModal.newFeatureName}"`
                        : azurePushModal.features[azurePushModal.selectedEpic]?.find(f => f.id === azurePushModal.selectedFeature)?.name || azurePushModal.selectedFeature
                    }
                  </p>
                  <p><span className="font-semibold">📝 User Story:</span> {azurePushModal.storyTitle}</p>
                  {azurePushModal.tags && (
                    <p><span className="font-semibold">🏷️ Tags:</span> {azurePushModal.tags}</p>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-600 text-center">
                {azurePushModal.createNewEpic || azurePushModal.createNewFeature
                  ? '⚠️ New items will be created in Azure DevOps'
                  : 'The user story will be added under the selected feature'}
              </p>
            </div>
          ) : (
            /* Selection Screen */
            <>
              {/* Project (Auto-filled from Settings) */}
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs text-green-700 font-semibold">PROJECT (From Settings)</p>
                <p className="text-sm text-green-900 font-bold">📁 {azurePushModal.selectedProject}</p>
              </div>

              {/* Epic Selection or Create New */}
              <div>
                <label className="label font-semibold text-gray-900 mb-2 block">
                  2️⃣ Epic *
                </label>

                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => setAzurePushModal(prev => ({ ...prev, createNewEpic: false, newEpicName: '' }))}
                    className={`flex-1 px-3 py-2 rounded-lg border-2 transition-all ${!azurePushModal.createNewEpic
                      ? 'border-blue-500 bg-blue-50 text-blue-900 font-semibold'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                  >
                    📋 Select Existing
                  </button>
                  <button
                    onClick={() => setAzurePushModal(prev => ({ ...prev, createNewEpic: true, selectedEpic: '' }))}
                    className={`flex-1 px-3 py-2 rounded-lg border-2 transition-all ${azurePushModal.createNewEpic
                      ? 'border-green-500 bg-green-50 text-green-900 font-semibold'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                  >
                    ✨ Create New
                  </button>
                </div>

                {azurePushModal.createNewEpic ? (
                  <input
                    type="text"
                    placeholder="Enter new Epic name..."
                    value={azurePushModal.newEpicName}
                    onChange={(e) => setAzurePushModal(prev => ({ ...prev, newEpicName: e.target.value }))}
                    className="input w-full bg-gray-50 border-gray-300 focus:border-green-500 focus:ring-2 focus:ring-green-500/30 rounded-lg"
                    autoFocus
                  />
                ) : (
                  <select
                    className="input w-full bg-gray-50 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg"
                    value={azurePushModal.selectedEpic}
                    onChange={(e) => {
                      const epicId = e.target.value;
                      setAzurePushModal(prev => ({ ...prev, selectedEpic: epicId, selectedFeature: '' }));
                      if (epicId) {
                        loadAzureFeatures(epicId);
                      }
                    }}
                    disabled={azurePushModal.epics.length === 0}
                  >
                    <option value="">Choose an Epic...</option>
                    {azurePushModal.epics.map((epic) => (
                      <option key={epic.id} value={epic.id}>{epic.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Feature Selection or Create New (only if Epic selected/created) */}
              {(azurePushModal.selectedEpic || azurePushModal.createNewEpic) && (
                <div>
                  <label className="label font-semibold text-gray-900 mb-2 block">
                    3️⃣ Feature *
                  </label>

                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => setAzurePushModal(prev => ({ ...prev, createNewFeature: false, newFeatureName: '' }))}
                      className={`flex-1 px-3 py-2 rounded-lg border-2 transition-all ${!azurePushModal.createNewFeature
                        ? 'border-blue-500 bg-blue-50 text-blue-900 font-semibold'
                        : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                        }`}
                    >
                      📋 Select Existing
                    </button>
                    <button
                      onClick={() => setAzurePushModal(prev => ({ ...prev, createNewFeature: true, selectedFeature: '' }))}
                      className={`flex-1 px-3 py-2 rounded-lg border-2 transition-all ${azurePushModal.createNewFeature
                        ? 'border-green-500 bg-green-50 text-green-900 font-semibold'
                        : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                        }`}
                    >
                      ✨ Create New
                    </button>
                  </div>

                  {azurePushModal.createNewFeature ? (
                    <input
                      type="text"
                      placeholder="Enter new Feature name..."
                      value={azurePushModal.newFeatureName}
                      onChange={(e) => setAzurePushModal(prev => ({ ...prev, newFeatureName: e.target.value }))}
                      className="input w-full bg-gray-50 border-gray-300 focus:border-green-500 focus:ring-2 focus:ring-green-500/30 rounded-lg"
                    />
                  ) : (
                    <select
                      className="input w-full bg-gray-50 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg"
                      value={azurePushModal.selectedFeature}
                      onChange={(e) => setAzurePushModal(prev => ({ ...prev, selectedFeature: e.target.value }))}
                      disabled={!azurePushModal.selectedEpic || !azurePushModal.features[azurePushModal.selectedEpic]}
                    >
                      <option value="">Choose a Feature...</option>
                      {azurePushModal.selectedEpic && azurePushModal.features[azurePushModal.selectedEpic]?.map((feat) => (
                        <option key={feat.id} value={feat.id}>{feat.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Tags (Optional) */}
              {(azurePushModal.selectedEpic || azurePushModal.createNewEpic) && (
                <div>
                  <label className="label font-semibold text-gray-900 mb-2 block">
                    🏷️ Tags (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Backend; API; Critical"
                    value={azurePushModal.tags}
                    onChange={(e) => setAzurePushModal(prev => ({ ...prev, tags: e.target.value }))}
                    className="input w-full bg-gray-50 border-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 rounded-lg"
                  />
                  <p className="text-xs text-gray-500 mt-1.5">Separate multiple tags with semicolons (;)</p>
                </div>
              )}
            </>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            {azurePushModal.showConfirmation ? (
              <>
                <button
                  className="btn btn-light px-4 py-2 rounded-lg transition-all duration-200 border border-gray-300 hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => setAzurePushModal(prev => ({ ...prev, showConfirmation: false }))}
                  disabled={azurePushModal.loading}
                >
                  <ChevronDown size={16} className="rotate-90" />
                  Back
                </button>
                <button
                  className="btn bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-2 rounded-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 border-0 hover:from-green-700 hover:to-green-800 font-semibold flex items-center gap-2"
                  onClick={submitAzurePush}
                  disabled={azurePushModal.loading}
                >
                  {azurePushModal.loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Pushing...
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      Confirm & Push
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-light px-4 py-2 rounded-lg transition-all duration-200 border border-gray-300 hover:bg-gray-100"
                  onClick={() => setAzurePushModal({
                    open: false,
                    storyId: null,
                    storyTitle: '',
                    selectedProject: '',
                    selectedEpic: '',
                    selectedFeature: '',
                    newEpicName: '',
                    newFeatureName: '',
                    createNewEpic: false,
                    createNewFeature: false,
                    showConfirmation: false,
                    tags: '',
                    projects: [],
                    epics: [],
                    features: [],
                    loading: false,
                  })}
                  disabled={azurePushModal.loading}
                >
                  Cancel
                </button>
                <button
                  className="btn bg-gradient-to-r from-sky-600 to-blue-600 text-white px-6 py-2 rounded-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 border-0 hover:from-sky-700 hover:to-blue-700 font-semibold flex items-center gap-2"
                  onClick={submitAzurePush}
                  disabled={azurePushModal.loading}
                >
                  <ChevronDown size={18} className="-rotate-90" />
                  Continue
                </button>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* Add Story Modal with Selection & Forms */}
      <Modal
        isOpen={addModal.open}
        onClose={() => {
          setAddModal({ open: false, mode: 'selection' });
          setManualStory({ title: '', description: '', acceptanceCriteria: '' });
        }}
        title={addModal.mode === 'selection' ? '➕ Add Story' : addModal.mode === 'manual' ? '📝 Add Story Manually' : addModal.mode === 'azure' ? '📥 Pull from Azure' : '✨ Generate with AI'}
      >
        {/* Selection Screen - 3 Cards */}
        {addModal.mode === 'selection' && (
          <div className="space-y-4">
            <p className="text-gray-700 text-center font-medium">Choose how you want to add a new story:</p>
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => setAddModal(prev => ({ ...prev, mode: 'ai' }))}
                className="p-6 rounded-lg border-2 border-[#ff9f1c]/50 hover:bg-[#ff9f1c]/10 transition-all text-center space-y-3 hover:border-[#ff9f1c] hover:shadow-lg hover:scale-105"
              >
                <div className="flex justify-center text-4xl">
                  <Wand2 size={32} className="text-[#ff9f1c]" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">Generate with AI</p>
                  <p className="text-xs text-gray-600 mt-1">AI-powered creation</p>
                </div>
              </button>
              <button
                onClick={() => setAddModal(prev => ({ ...prev, mode: 'manual' }))}
                className="p-6 rounded-lg border-2 border-[#0b2b4c]/30 hover:bg-[#0b2b4c]/10 transition-all text-center space-y-3 hover:border-[#0b2b4c] hover:shadow-lg hover:scale-105"
              >
                <div className="flex justify-center text-4xl">
                  <Edit2 size={32} className="text-[#0b2b4c]" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">Add Manually</p>
                  <p className="text-xs text-gray-600 mt-1">Write it yourself</p>
                </div>
              </button>
              <button
                onClick={() => setAddModal(prev => ({ ...prev, mode: 'azure' }))}
                className="p-6 rounded-lg border-2 border-sky-500/50 hover:bg-sky-50 transition-all text-center space-y-3 hover:border-sky-500 hover:shadow-lg hover:scale-105"
              >
                <div className="flex justify-center text-4xl">
                  <Download size={32} className="text-sky-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">Pull from Azure</p>
                  <p className="text-xs text-gray-600 mt-1">Import from DevOps</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Manual Entry Form */}
        {addModal.mode === 'manual' && (
          <div className="space-y-4">
            <div>
              <label className="label font-semibold text-gray-900 mb-2 block">Title *</label>
              <input
                type="text"
                placeholder="Enter story title..."
                value={manualStory.title}
                onChange={(e) => setManualStory(prev => ({ ...prev, title: e.target.value }))}
                className="input w-full bg-gray-50 border-gray-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 rounded-lg"
              />
            </div>

            <div>
              <label className="label font-semibold text-gray-900 mb-2 block">Description</label>
              <textarea
                placeholder="Enter story description..."
                value={manualStory.description}
                onChange={(e) => setManualStory(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="input w-full bg-gray-50 border-gray-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 rounded-lg resize-none"
              />
            </div>

            <div>
              <label className="label font-semibold text-gray-900 mb-2 block">Acceptance Criteria</label>
              <textarea
                placeholder="One criterion per line&#10;e.g.&#10;System must be accessible&#10;Response time under 2 seconds"
                value={manualStory.acceptanceCriteria}
                onChange={(e) => setManualStory(prev => ({ ...prev, acceptanceCriteria: e.target.value }))}
                rows={4}
                className="input w-full bg-gray-50 border-gray-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 rounded-lg resize-none font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Separate each criterion with a new line</p>
            </div>

            <div className="flex justify-between gap-3 pt-2 border-t border-gray-200">
              <button
                onClick={() => {
                  setAddModal(prev => ({ ...prev, mode: 'selection' }));
                  setManualStory({ title: '', description: '', acceptanceCriteria: '' });
                }}
                className="btn btn-light px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 flex items-center gap-2"
              >
                <ChevronDown size={16} className="rotate-90" />
                Back
              </button>
              <button
                onClick={addManualStory}
                className="btn bg-gradient-to-r from-sky-600 to-blue-600 text-white px-6 py-2 rounded-lg hover:shadow-lg hover:-translate-y-0.5 transition-all font-semibold flex items-center gap-2"
              >
                <Plus size={18} />
                Add Story
              </button>
            </div>
          </div>
        )}

        {/* Azure Pull Form */}
        {addModal.mode === 'azure' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 mb-3">Pull a work item from Azure DevOps and add it as a story</p>

            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Enter Work Item ID (e.g., 123)"
                value={pullFromAzureModal.workItemId}
                onChange={(e) => setPullFromAzureModal(prev => ({ ...prev, workItemId: e.target.value }))}
                className="input flex-1 bg-gray-50 border-gray-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 rounded-lg"
              />
              <button
                onClick={searchAzureWorkItem}
                className="btn bg-sky-600 text-white px-6 py-2 rounded-lg hover:bg-sky-700 transition-all"
                disabled={pullFromAzureModal.loading || !pullFromAzureModal.workItemId.trim()}
              >
                {pullFromAzureModal.loading ? (
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent"></div>
                ) : (
                  'Search'
                )}
              </button>
            </div>

            {pullFromAzureModal.workItem && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <p className="text-sm font-semibold text-blue-900">
                  <span className="inline-block bg-blue-100 px-2 py-0.5 rounded text-xs mr-2">{pullFromAzureModal.workItem.type}</span>
                  #{pullFromAzureModal.workItem.id}
                </p>
                <p className="text-sm font-medium text-blue-900">{pullFromAzureModal.workItem.title}</p>

                {pullFromAzureModal.children.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-blue-700 mb-1 block">Child Items ({pullFromAzureModal.children.length})</label>
                    <select
                      value={pullFromAzureModal.selectedChild || ''}
                      onChange={(e) => setPullFromAzureModal(prev => ({ ...prev, selectedChild: e.target.value }))}
                      className="input w-full bg-white border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg text-sm"
                    >
                      <option value="">-- Select a child item --</option>
                      {pullFromAzureModal.children.map(child => (
                        <option key={child.id} value={child.id}>
                          {child.type}: {child.title} (#{child.id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between gap-3 pt-2 border-t border-gray-200">
              <button
                onClick={() => {
                  setAddModal(prev => ({ ...prev, mode: 'selection' }));
                  setPullFromAzureModal({
                    open: false,
                    workItemId: '',
                    loading: false,
                    workItem: null,
                    children: [],
                    selectedChild: null,
                  });
                }}
                className="btn btn-light px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 flex items-center gap-2"
              >
                <ChevronDown size={16} className="rotate-90" />
                Back
              </button>
              {pullFromAzureModal.workItem && (
                <button
                  onClick={() => {
                    addPulledStory();
                    setAddModal({ open: false, mode: 'selection' });
                  }}
                  className="btn bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-2 rounded-lg hover:shadow-lg hover:-translate-y-0.5 transition-all font-semibold flex items-center gap-2"
                >
                  <Plus size={18} />
                  Add to Stories
                </button>
              )}
            </div>
          </div>
        )}

        {/* AI Generate Option */}
        {addModal.mode === 'ai' && (
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200">
              <p className="text-sm text-purple-900 mb-3">
                Use the full AI Story Generator to create multiple stories with advanced options and customization.
              </p>
              <button
                onClick={() => {
                  setAddModal({ open: false, mode: 'selection' });
                  setGenerateModal(true);
                }}
                className="btn bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-2 rounded-lg hover:shadow-lg transition-all font-semibold flex items-center gap-2 w-full justify-center"
              >
                <Wand2 size={18} />
                Open AI Generator
              </button>
            </div>
            <div className="flex justify-start pt-2 border-t border-gray-200">
              <button
                onClick={() => setAddModal(prev => ({ ...prev, mode: 'selection' }))}
                className="btn btn-light px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 flex items-center gap-2"
              >
                <ChevronDown size={16} className="rotate-90" />
                Back
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Pull from Azure Modal */}
      <Modal
        isOpen={pullFromAzureModal.open}
        onClose={() => setPullFromAzureModal({
          open: false,
          workItemId: '',
          loading: false,
          workItem: null,
          children: [],
          selectedChild: null,
        })}
        title="📥 Pull from Azure DevOps"
      >
        <div className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Enter Work Item ID (e.g., 123)"
              value={pullFromAzureModal.workItemId}
              onChange={(e) => setPullFromAzureModal(prev => ({ ...prev, workItemId: e.target.value }))}
              className="input flex-1 bg-gray-50 border-gray-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 rounded-lg"
              disabled={pullFromAzureModal.loading}
            />
            <button
              onClick={searchAzureWorkItem}
              className="btn bg-sky-600 text-white px-6 py-2 rounded-lg hover:bg-sky-700 transition-all"
              disabled={pullFromAzureModal.loading || !pullFromAzureModal.workItemId.trim()}
            >
              {pullFromAzureModal.loading ? (
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent"></div>
              ) : (
                'Search'
              )}
            </button>
          </div>

          {/* Work Item Preview */}
          {pullFromAzureModal.workItem && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-sky-50 border-2 border-blue-200 rounded-lg space-y-3">
              <div>
                <p className="text-xs text-blue-600 font-semibold mb-1">WORK ITEM</p>
                <p className="text-sm text-blue-900 font-bold">
                  <span className="inline-block bg-blue-100 px-2 py-1 rounded mr-2">{pullFromAzureModal.workItem.type}</span>
                  #{pullFromAzureModal.workItem.id}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-900">{pullFromAzureModal.workItem.title}</p>
              </div>
              {pullFromAzureModal.workItem.description && (
                <div>
                  <p className="text-xs text-blue-700 font-semibold mb-1">Description:</p>
                  <p className="text-xs text-blue-800 line-clamp-2">{pullFromAzureModal.workItem.description}</p>
                </div>
              )}
              <div className="flex gap-2 text-xs">
                <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded">State: {pullFromAzureModal.workItem.state}</span>
                <span className="inline-block bg-purple-100 text-purple-800 px-2 py-1 rounded">Priority: {pullFromAzureModal.workItem.priority}</span>
              </div>

              {/* Children Selection (for Epic/Feature) */}
              {pullFromAzureModal.children.length > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-xs text-blue-600 font-semibold mb-2">
                    📋 Child Items ({pullFromAzureModal.children.length})
                  </p>
                  <select
                    value={pullFromAzureModal.selectedChild || ''}
                    onChange={(e) => setPullFromAzureModal(prev => ({ ...prev, selectedChild: e.target.value }))}
                    className="input w-full bg-white border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg text-sm"
                  >
                    <option value="">-- Select a child item --</option>
                    {pullFromAzureModal.children.map(child => (
                      <option key={child.id} value={child.id}>
                        {child.type}: {child.title} (#{child.id})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-blue-600 mt-1.5">
                    {pullFromAzureModal.selectedChild
                      ? '✓ Child item selected - it will be added as a new story'
                      : 'Select a child item to add it as a story'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
            <button
              onClick={() => setPullFromAzureModal({
                open: false,
                workItemId: '',
                loading: false,
                workItem: null,
                children: [],
                selectedChild: null,
              })}
              className="btn btn-light px-4 py-2 rounded-lg transition-all border border-gray-300 hover:bg-gray-100"
              disabled={pullFromAzureModal.loading}
            >
              Cancel
            </button>
            {pullFromAzureModal.workItem && (
              <button
                onClick={addPulledStory}
                className="btn bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-2 rounded-lg hover:shadow-lg hover:-translate-y-0.5 transition-all border-0 font-semibold flex items-center gap-2"
                disabled={pullFromAzureModal.loading}
              >
                <Plus size={18} />
                Add to Stories
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Bulk Push to Azure Modal */}
      <Modal
        isOpen={bulkPushModal.open}
        onClose={closeBulkPushModal}
        title={
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {bulkPushModal.step === 'config' && 'Bulk Push to Azure DevOps'}
                {bulkPushModal.step === 'progress' && 'Pushing Stories...'}
                {bulkPushModal.step === 'results' && 'Push Results'}
              </h2>
              <p className="text-sm text-gray-500 font-normal">
                {bulkPushModal.step === 'config' && `${bulkPushModal.totalCount} stories selected`}
                {bulkPushModal.step === 'progress' && `${bulkPushModal.currentIndex} of ${bulkPushModal.totalCount}`}
                {bulkPushModal.step === 'results' && bulkPushModal.results && `${bulkPushModal.results.success.length} succeeded, ${bulkPushModal.results.failed.length} failed`}
              </p>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Step 1: Configuration */}
          {bulkPushModal.step === 'config' && (
            <>
              {bulkPushModal.loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
                </div>
              ) : (
                <>
                  {/* Epic Selection */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="createNewEpicBulk"
                        checked={bulkPushModal.createNewEpic}
                        onChange={(e) => setBulkPushModal(prev => ({
                          ...prev,
                          createNewEpic: e.target.checked,
                          selectedEpic: e.target.checked ? '' : prev.selectedEpic,
                        }))}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300"
                      />
                      <label htmlFor="createNewEpicBulk" className="text-sm font-medium text-gray-700">Create new Epic</label>
                    </div>

                    {bulkPushModal.createNewEpic ? (
                      <input
                        type="text"
                        placeholder="Enter new Epic name"
                        value={bulkPushModal.newEpicName}
                        onChange={(e) => setBulkPushModal(prev => ({ ...prev, newEpicName: e.target.value }))}
                        className="input w-full bg-gray-50 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg"
                      />
                    ) : (
                      <select
                        value={bulkPushModal.selectedEpic}
                        onChange={(e) => {
                          const epicId = e.target.value;
                          setBulkPushModal(prev => ({ ...prev, selectedEpic: epicId, selectedFeature: '' }));
                          if (epicId) loadBulkPushFeatures(epicId);
                        }}
                        className="input w-full bg-gray-50 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg"
                      >
                        <option value="">-- Select Epic --</option>
                        {bulkPushModal.epics.map(epic => (
                          <option key={epic.id} value={epic.id}>{epic.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Feature Selection */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="createNewFeatureBulk"
                        checked={bulkPushModal.createNewFeature}
                        onChange={(e) => setBulkPushModal(prev => ({
                          ...prev,
                          createNewFeature: e.target.checked,
                          selectedFeature: e.target.checked ? '' : prev.selectedFeature,
                        }))}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300"
                      />
                      <label htmlFor="createNewFeatureBulk" className="text-sm font-medium text-gray-700">Create new Feature</label>
                    </div>

                    {bulkPushModal.createNewFeature ? (
                      <input
                        type="text"
                        placeholder="Enter new Feature name"
                        value={bulkPushModal.newFeatureName}
                        onChange={(e) => setBulkPushModal(prev => ({ ...prev, newFeatureName: e.target.value }))}
                        className="input w-full bg-gray-50 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg"
                      />
                    ) : (
                      <select
                        value={bulkPushModal.selectedFeature}
                        onChange={(e) => setBulkPushModal(prev => ({ ...prev, selectedFeature: e.target.value }))}
                        className="input w-full bg-gray-50 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg"
                        disabled={!bulkPushModal.selectedEpic && !bulkPushModal.createNewEpic}
                      >
                        <option value="">-- Select Feature --</option>
                        {(bulkPushModal.features[bulkPushModal.selectedEpic] || []).map(feature => (
                          <option key={feature.id} value={feature.id}>{feature.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tags (optional)</label>
                    <input
                      type="text"
                      placeholder="tag1, tag2, tag3"
                      value={bulkPushModal.tags}
                      onChange={(e) => setBulkPushModal(prev => ({ ...prev, tags: e.target.value }))}
                      className="input w-full bg-gray-50 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg"
                    />
                  </div>

                  {/* Summary */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-900">
                      <span className="font-semibold">{bulkPushModal.totalCount}</span> stories will be pushed to Azure DevOps
                      {(bulkPushModal.selectedEpic || bulkPushModal.newEpicName) && (
                        <> under <span className="font-semibold">{bulkPushModal.createNewEpic ? bulkPushModal.newEpicName : bulkPushModal.epics.find(e => e.id === bulkPushModal.selectedEpic)?.name}</span></>
                      )}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
                    <button
                      onClick={closeBulkPushModal}
                      className="btn px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeBulkPush}
                      className="btn bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      Push to Azure
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 2: Progress */}
          {bulkPushModal.step === 'progress' && (
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Progress</span>
                  <span>{bulkPushModal.currentIndex} / {bulkPushModal.totalCount}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${(bulkPushModal.currentIndex / bulkPushModal.totalCount) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Current Story */}
              {bulkPushModal.currentStory && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Currently pushing:</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{bulkPushModal.currentStory.title}</p>
                </div>
              )}

              {/* Progress Log */}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {bulkPushModal.progressLog.map((log, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 text-xs p-2 rounded ${log.result.success ? 'bg-green-50 text-green-800' :
                      log.result.skipped ? 'bg-yellow-50 text-yellow-800' :
                        'bg-red-50 text-red-800'
                      }`}
                  >
                    {log.result.success ? (
                      <Check size={14} className="text-green-600" />
                    ) : log.result.skipped ? (
                      <span className="text-yellow-600">⏭</span>
                    ) : (
                      <AlertCircle size={14} className="text-red-600" />
                    )}
                    <span className="truncate flex-1">{log.story.title}</span>
                    {log.result.workItemId && (
                      <span className="font-mono text-green-700">#{log.result.workItemId}</span>
                    )}
                    {log.result.error && (
                      <span className="text-red-600 truncate">{log.result.error}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-center py-2">
                <div className="animate-spin h-6 w-6 border-3 border-blue-600 border-t-transparent rounded-full"></div>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {bulkPushModal.step === 'results' && bulkPushModal.results && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-green-700">{bulkPushModal.results.success.length}</p>
                  <p className="text-sm text-green-600">Successful</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-red-700">{bulkPushModal.results.failed.length}</p>
                  <p className="text-sm text-red-600">Failed</p>
                </div>
              </div>

              {/* Success List */}
              {bulkPushModal.results.success.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-green-800 mb-2">✅ Successfully pushed:</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {bulkPushModal.results.success.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs bg-green-50 p-2 rounded">
                        <Check size={14} className="text-green-600" />
                        <span className="truncate flex-1">{item.story.title}</span>
                        <span className="font-mono text-green-700 font-semibold">#{item.workItemId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failed List */}
              {bulkPushModal.results.failed.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-red-800 mb-2">❌ Failed to push:</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {bulkPushModal.results.failed.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs bg-red-50 p-2 rounded">
                        <AlertCircle size={14} className="text-red-600" />
                        <span className="truncate flex-1">{item.story.title}</span>
                        <span className="text-red-600">{item.skipped ? 'Skipped' : item.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Close Button */}
              <div className="flex justify-end pt-2 border-t border-gray-200">
                <button
                  onClick={closeBulkPushModal}
                  className="btn bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}

      <Modal
        isOpen={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, storyId: null, count: 0 })}
        title="🗑️ Delete Confirmation"
      >
        <div className="space-y-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-900 font-semibold">
              {deleteConfirm.count > 1
                ? `Delete ${deleteConfirm.count} stories?`
                : 'Delete this story?'}
            </p>
            <p className="text-red-700 text-sm mt-2">
              This action cannot be undone. All data associated will be permanently deleted.
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleteConfirm({ open: false, storyId: null, count: 0 })}
              className="btn px-6 py-2.5 rounded-lg transition-all duration-200 border-2 border-gray-300 text-gray-700 bg-white hover:bg-gray-50 font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={deleteConfirm.count > 1 ? confirmDeleteSelected : confirmDelete}
              className="btn px-6 py-2.5 rounded-lg transition-all duration-200 bg-red-600 text-white border-0 hover:bg-red-700 hover:shadow-lg font-semibold flex items-center gap-2"
            >
              <Trash2 size={18} />
              Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* Generate Modal */}
      <Modal
        isOpen={generateModal}
        onClose={() => setGenerateModal(false)}
        title={
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ff9f1c]/10 backdrop-blur rounded-lg">
              <Wand2 size={24} className="text-[#ff9f1c]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0b2b4c]">Generate Stories with AI</h2>
              <p className="text-sm text-gray-600 font-normal mt-0.5">Create user stories instantly using AI</p>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <form onSubmit={handleGenerate} className="space-y-5">
            {/* Requirements */}
            <div>
              <label className="label font-semibold text-gray-900 mb-2">Requirements *</label>
              <textarea
                value={requirementsText}
                onChange={(e) => setRequirementsText(e.target.value)}
                className="input resize-none h-32 bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg w-full"
                placeholder="Describe the feature, requirements, and any specific details..."
                required
              />
              <p className="text-xs text-gray-500 mt-2 font-medium">Minimum 30 characters required</p>
            </div>

            {/* Count & Level */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label font-semibold text-gray-900 mb-2 block">Story Count</label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={storyCount}
                  onChange={(e) => setStoryCount(parseInt(e.target.value, 10) || 1)}
                  className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
                />
              </div>
              <div>
                <label className="label font-semibold text-gray-900 mb-2 block">Complexity Level</label>
                <select
                  value={complexity}
                  onChange={(e) => setComplexity(e.target.value)}
                  className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
                >
                  <option value="simple">🟢 Simple</option>
                  <option value="standard">🟡 Standard</option>
                  <option value="complex">🔴 Complex</option>
                </select>
              </div>
            </div>

            {/* Language & Template */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label font-semibold text-gray-900 mb-2 block">Language</label>
                <input
                  type="text"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
                  placeholder="en, ar, es..."
                />
              </div>
              <div>
                <label className="label font-semibold text-gray-900 mb-2 block">Template</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="input w-full bg-gray-50 border-gray-300 focus:border-[#ff9f1c] focus:ring-2 focus:ring-[#ff9f1c]/30 rounded-lg"
                  disabled={loadingTemplates}
                >
                  <option value="">Auto Select Best Template</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                className="btn btn-light px-5 py-2.5 rounded-lg transition-all duration-200 border border-gray-300 hover:bg-gray-100 font-semibold"
                onClick={() => setGenerateModal(false)}
                disabled={generating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn flex items-center gap-2 px-6 py-2.5 rounded-lg transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 bg-[#ff9f1c] text-[#0b2b4c] border-0 hover:bg-[#e68c17] font-semibold"
                disabled={generating}
              >
                <Wand2 size={20} />
                <span>{generating ? 'Generating...' : 'Generate Stories'}</span>
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}