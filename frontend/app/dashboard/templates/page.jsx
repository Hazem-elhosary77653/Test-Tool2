'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';
import {
  Plus,
  Search,
  FileText,
  Layout,
  MessageSquare,
  Mail,
  Edit2,
  Trash2,
  Eye,
  Copy,
  Check,
  X,
  Info,
  AlertCircle,
  MoreVertical,
  Filter,
  Save,
  Code,
  Zap,
  ShieldCheck,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { useAuthStore } from '@/store';
import api from '@/lib/api';

const CATEGORIES = [
  { id: 'brd', label: 'BRD Documents', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
  { id: 'story', label: 'User Stories', icon: Layout, color: 'text-purple-500', bg: 'bg-purple-50' },
  { id: 'document', label: 'General Documents', icon: MessageSquare, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 'email', label: 'Email Templates', icon: Mail, color: 'text-orange-500', bg: 'bg-orange-50' }
];

const BRD_SECTIONS = [
  { id: 'exec_summary', label: 'Executive Summary', description: 'High-level project overview' },
  { id: 'biz_goals', label: 'Business Goals', description: 'What this project aims to achieve' },
  { id: 'scope', label: 'Project Scope', description: 'What is included and excluded' },
  { id: 'stakeholders', label: 'Stakeholders', description: 'Key people involved' },
  { id: 'functional_reqs', label: 'Functional Requirements', description: 'Detailed feature requirements' },
  { id: 'non_functional', label: 'Non-Functional Requirements', description: 'Performance, Security, etc.' },
  { id: 'user_personas', label: 'User Personas', description: 'Types of users for the system' },
  { id: 'process_flow', label: 'Process Flow', description: 'Step-by-step workflow' },
  { id: 'assumptions', label: 'Assumptions & Constraints', description: 'Pre-conditions and limitations' },
  { id: 'success_metrics', label: 'Success Metrics/KPIs', description: 'How to measure success' }
];

export default function TemplatesPage() {
  const { user } = useAuthStore();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [status, setStatus] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [viewingTemplate, setViewingTemplate] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    content: '',
    category: 'brd',
    is_public: false,
    variables: [],
    selectedSections: [],
    customSections: []
  });

  const [newCustomSection, setNewCustomSection] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Automatically build content when sections change (only for BRD)
  useEffect(() => {
    if (form.category === 'brd' && (form.selectedSections.length > 0 || form.customSections.length > 0)) {
      let newContent = `# ${form.name || 'BRD Template'}\n\n`;

      form.selectedSections.forEach(sectionId => {
        const section = BRD_SECTIONS.find(s => s.id === sectionId);
        if (section) {
          newContent += `## ${section.label}\n{{${section.id}_details}}\n\n`;
        }
      });

      form.customSections.forEach(sectionName => {
        const safeName = sectionName.toLowerCase().replace(/\s+/g, '_');
        newContent += `## ${sectionName}\n{{${safeName}_details}}\n\n`;
      });

      setForm(prev => ({ ...prev, content: newContent }));
    }
  }, [form.selectedSections, form.customSections, form.category]);

  // Automatically detect variables in content
  useEffect(() => {
    const variableRegex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    const matches = form.content.matchAll(variableRegex);
    const vars = Array.from(new Set(Array.from(matches, m => m[1])));
    setForm(prev => ({ ...prev, variables: vars }));
  }, [form.content]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await api.get('/templates');
      setTemplates(response.data?.data || []);
    } catch (err) {
      console.error('Error fetching templates:', err);
      setStatus({ type: 'error', message: 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!form.content.trim()) errors.content = 'Content is required';
    return errors;
  };

  const handleSubmit = async (e, { closeAfter = true, asDraft = false } = {}) => {
    if (e) e.preventDefault();
    const errors = validateForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setSaving(true);
      const payload = { ...form, is_public: asDraft ? false : form.is_public };

      if (editingTemplate) {
        await api.put(`/templates/${editingTemplate.id}`, payload);
        setStatus({ type: 'success', message: 'Template updated successfully!' });
      } else {
        await api.post('/templates', payload);
        setStatus({ type: 'success', message: 'Template created successfully!' });
      }

      if (closeAfter) {
        setIsModalOpen(false);
        resetForm();
      }
      fetchTemplates();
    } catch (err) {
      console.error('Error saving template:', err);
      setStatus({ type: 'error', message: err.response?.data?.error || 'Failed to save template' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    try {
      await api.delete(`/templates/${templateToDelete.id}`);
      setStatus({ type: 'success', message: 'Template deleted successfully' });
      setIsDeleteModalOpen(false);
      setTemplateToDelete(null);
      fetchTemplates();
    } catch (err) {
      console.error('Error deleting template:', err);
      setStatus({ type: 'error', message: 'Failed to delete template' });
    }
  };

  const openEditModal = (template) => {
    setEditingTemplate(template);
    setForm({
      name: template.name,
      description: template.description || '',
      content: template.content,
      category: template.category,
      is_public: template.is_public === 1,
      variables: template.variables || [],
      selectedSections: [], // In real app, we could parse content to find these
      customSections: []
    });
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setEditingTemplate(null);
    setForm({
      name: '',
      description: '',
      content: '',
      category: 'brd',
      is_public: false,
      variables: [],
      selectedSections: [],
      customSections: []
    });
    setNewCustomSection('');
  };

  const toggleSection = (sectionId) => {
    setForm(prev => ({
      ...prev,
      selectedSections: prev.selectedSections.includes(sectionId)
        ? prev.selectedSections.filter(id => id !== sectionId)
        : [...prev.selectedSections, sectionId]
    }));
  };

  const addCustomSection = () => {
    if (!newCustomSection.trim()) return;
    setForm(prev => ({
      ...prev,
      customSections: [...prev.customSections, newCustomSection]
    }));
    setNewCustomSection('');
  };

  const removeCustomSection = (sectionName) => {
    setForm(prev => ({
      ...prev,
      customSections: prev.customSections.filter(s => s !== sectionName)
    }));
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || t.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [templates, searchTerm, filterCategory]);

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Templates Management" />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Action Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 flex-1 min-w-[300px]">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search templates..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1">
                  <button
                    onClick={() => setFilterCategory('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterCategory === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    All
                  </button>
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setFilterCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterCategory === cat.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {cat.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => { resetForm(); setIsModalOpen(true); }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                Create Template
              </button>
            </div>

            {/* Status Messages */}
            {status && (
              <div className={`p-4 rounded-xl flex items-center justify-between slide-in ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                <div className="flex items-center gap-3">
                  {status.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  <span className="text-sm font-medium">{status.message}</span>
                </div>
                <button onClick={() => setStatus(null)}><X className="w-4 h-4" /></button>
              </div>
            )}

            {/* Template Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-64 bg-white rounded-2xl border border-slate-200 animate-pulse"></div>
                ))}
              </div>
            ) : filteredTemplates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTemplates.map(template => {
                  const category = CATEGORIES.find(c => c.id === template.category) || CATEGORIES[0];
                  const Icon = category.icon;

                  return (
                    <div
                      key={template.id}
                      className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className={`p-3 rounded-xl ${category.bg} ${category.color}`}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setViewingTemplate(template)}
                              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                              title="View Preview"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEditModal(template)}
                              className="p-2 hover:bg-slate-100 rounded-lg text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setTemplateToDelete(template); setIsDeleteModalOpen(true); }}
                              className="p-2 hover:bg-rose-50 rounded-lg text-rose-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <h3 className="text-lg font-bold text-slate-900 mb-1 line-clamp-1">{template.name}</h3>
                        <p className="text-sm text-slate-500 line-clamp-2 mb-4 h-10">{template.description || 'No description provided.'}</p>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              <Code className="w-3 h-3" />
                              {template.variables?.length || 0} Variables
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${template.is_public ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                            {template.is_public ? 'Public' : 'Private'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                <div className="p-6 bg-slate-50 rounded-full mb-4">
                  <Layout className="w-12 h-12 text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">No templates found</h3>
                <p className="text-slate-500 mb-6 max-w-sm text-center">Get started by creating your first custom template to power your AI generation workflow.</p>
                <button
                  onClick={() => { resetForm(); setIsModalOpen(true); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/20"
                >
                  Create Custom Template
                </button>
              </div>
            )}
          </div>
        </main>

        {/* Create/Edit Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={resetForm}
          title={
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg rotate-3 group-hover:rotate-0 transition-transform">
                <Zap size={22} fill="currentColor" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  {editingTemplate ? 'Template Architect' : 'New Template Studio'}
                </h2>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <span>Workspace</span>
                  <ChevronRight size={10} />
                  <span className="text-purple-600">Document Blueprint</span>
                </div>
              </div>
            </div>
          }
          size="xl"
        >
          <div className="flex flex-col lg:flex-row h-[78vh] bg-slate-50/50 rounded-b-3xl overflow-hidden">
            {/* Left: Workbench (Configuration) */}
            <div className="w-full lg:w-[420px] bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

                {/* Meta Info Section */}
                <section className="space-y-4">
                  <header className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">General Settings</h3>
                    {formErrors.name && <span className="text-[10px] text-rose-500 font-bold animate-pulse">Required</span>}
                  </header>

                  <div className="space-y-4">
                    <div className="group">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1.5 ml-1 transition-colors group-focus-within:text-purple-600">Template Identifier</label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:bg-white focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all shadow-sm"
                        placeholder="e.g., Global Fintech Standard"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1.5 ml-1">Context</label>
                        <select
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:bg-white focus:border-purple-500 outline-none transition-all cursor-pointer"
                          value={form.category}
                          onChange={(e) => setForm({ ...form, category: e.target.value })}
                        >
                          {CATEGORIES.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1.5 ml-1">Access</label>
                        <button
                          onClick={() => setForm({ ...form, is_public: !form.is_public })}
                          className={`w-full px-4 py-3 rounded-2xl text-sm font-bold border transition-all flex items-center justify-between ${form.is_public ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                        >
                          <span>{form.is_public ? 'Public' : 'Private'}</span>
                          <div className={`w-2 h-2 rounded-full ${form.is_public ? 'bg-purple-500 animate-pulse' : 'bg-slate-300'}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Composition Tools */}
                <section className="space-y-4">
                  <header className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Structure Builder</h3>
                    <div className="flex gap-1">
                      <span className="px-2 py-0.5 bg-slate-100 text-[9px] font-bold rounded text-slate-500">Auto-Generate</span>
                    </div>
                  </header>

                  <div className="bg-slate-900 rounded-[2rem] p-5 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Layout size={60} className="text-white" />
                    </div>

                    <div className="grid grid-cols-2 gap-2 relative z-10">
                      {BRD_SECTIONS.map(section => (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => toggleSection(section.id)}
                          className={`flex flex-col p-3 rounded-xl border transition-all text-left ${form.selectedSections.includes(section.id)
                            ? 'bg-white border-white scale-[1.02] shadow-xl'
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                            }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className={`p-1 rounded-md ${form.selectedSections.includes(section.id) ? 'bg-purple-100 text-purple-600' : 'text-white/30'}`}>
                              {form.selectedSections.includes(section.id) ? <Check size={12} strokeWidth={3} /> : <Plus size={12} />}
                            </div>
                          </div>
                          <span className={`text-[11px] font-black tracking-tight leading-tight ${form.selectedSections.includes(section.id) ? 'text-slate-900' : 'text-white/60'}`}>
                            {section.label}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="mt-5 pt-5 border-t border-white/10 relative z-10">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Add custom segment..."
                          className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-white/20 outline-none focus:bg-white/10 transition-all font-medium"
                          value={newCustomSection}
                          onChange={(e) => setNewCustomSection(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomSection())}
                        />
                        <button
                          type="button"
                          onClick={addCustomSection}
                          className="w-10 h-10 bg-white text-slate-900 rounded-xl flex items-center justify-center hover:scale-105 transition-all shadow-lg active:scale-95"
                        >
                          <Plus size={18} strokeWidth={3} />
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Description */}
                <section className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Blueprint Intent</h3>
                  <textarea
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm min-h-[100px] focus:bg-white focus:border-purple-500 outline-none transition-all resize-none shadow-sm font-medium italic text-slate-600"
                    placeholder="Detail the purpose and audience for this document..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </section>
              </div>

              {/* Workbench Footer */}
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Architect</span>
                  <span className="text-xs font-bold text-purple-600">Ready to Push</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="p-3 text-slate-400 hover:text-slate-900 transition-colors"
                  >
                    <X size={20} />
                  </button>
                  <button
                    disabled={saving}
                    onClick={(e) => handleSubmit(e)}
                    className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-black transition-all shadow-xl shadow-slate-200 flex items-center gap-3 disabled:opacity-50"
                  >
                    {saving ? <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={18} />}
                    <span>Save Master</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Live Preview (Paper View) */}
            <div className="flex-1 bg-slate-100 p-8 flex flex-col items-center justify-center relative overflow-hidden">

              {/* Decorative Background Elements */}
              <div className="absolute top-20 right-20 w-64 h-64 bg-purple-500/5 blur-[100px] rounded-full" />
              <div className="absolute bottom-20 left-20 w-80 h-80 bg-blue-500/5 blur-[100px] rounded-full" />

              <div className="w-full max-w-2xl h-full flex flex-col">
                <div className="flex items-center justify-between mb-4 px-2">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Real-time Preview Mode</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-white rounded-full text-[10px] font-black text-purple-600 shadow-sm border border-slate-200">
                      {form.variables.length} AI VARIABLES DETECTED
                    </span>
                  </div>
                </div>

                <div className="flex-1 bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-200 p-12 overflow-y-auto custom-scrollbar relative">
                  {/* Paper texture feel */}
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/notebook.png')]" />

                  {form.content ? (
                    <div className="relative z-10 font-serif">
                      <header className="mb-10 pb-6 border-b-2 border-slate-100">
                        <h1 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tight">{form.name || 'Untitled Document'}</h1>
                        <p className="text-sm text-slate-400 font-bold tracking-widest uppercase">System Template Blueprint v1.0</p>
                      </header>
                      <pre className="whitespace-pre-wrap font-sans text-slate-600 leading-8 text-[15px]">
                        {form.content}
                      </pre>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                      <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center text-slate-200 border-2 border-dashed border-slate-200 animate-bounce-slow">
                        <Sparkles size={48} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">Empty Canvas</h4>
                        <p className="text-sm text-slate-400 font-medium max-w-[240px] leading-relaxed">Select sections from the workbench to generate your blueprint.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Modal>

        {/* View Modal */}
        <Modal
          isOpen={!!viewingTemplate}
          onClose={() => setViewingTemplate(null)}
          title={viewingTemplate?.name || 'Preview'}
          size="lg"
        >
          <div className="space-y-6">
            <div className="prose prose-slate max-w-none">
              <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl font-mono text-sm overflow-auto whitespace-pre-wrap max-h-[500px]">
                {viewingTemplate?.content}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Category</span>
                <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  {(() => {
                    const cat = CATEGORIES.find(c => c.id === viewingTemplate?.category);
                    const Icon = cat?.icon || Info;
                    return <><Icon className="w-4 h-4 text-blue-500" /> {cat?.label || 'General'}</>;
                  })()}
                </span>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Variables Identified</span>
                <span className="text-sm font-bold text-slate-700">{viewingTemplate?.variables?.length || 0} Dynamic Tags</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(viewingTemplate.content);
                  setStatus({ type: 'success', message: 'Content copied to clipboard!' });
                }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
              >
                <Copy className="w-4 h-4" />
                Copy Source
              </button>
              <button
                onClick={() => setViewingTemplate(null)}
                className="px-8 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-all shadow-lg"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Delete Template"
          size="sm"
        >
          <div className="space-y-6 text-center">
            <div className="mx-auto w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center">
              <Trash2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Confirm Deletion</h3>
              <p className="text-slate-500 text-sm">Are you sure you want to delete <span className="font-bold text-slate-700">"{templateToDelete?.name}"</span>? This action cannot be undone.</p>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all border border-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-rose-500/20 active:scale-95"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </Modal>

      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .slide-in {
          animation: slideIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
