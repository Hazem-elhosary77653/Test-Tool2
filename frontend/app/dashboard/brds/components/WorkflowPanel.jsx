'use client';

import React, { useState, useEffect } from 'react';
import {
  Send,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  History,
  ArrowRight,
} from 'lucide-react';
import api from '@/lib/api';

export default function WorkflowPanel({ brdId, currentStatus, assignedTo, userId, ownerId, onStatusChange }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewers, setReviewers] = useState([]);
  const [selectedReviewer, setSelectedReviewer] = useState(null);
  const [reason, setReason] = useState('');
  const [showReviewerDropdown, setShowReviewerDropdown] = useState(false);
  const [workflowHistory, setWorkflowHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const formatDateTime = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getStatusMeta = (fromStatus, toStatus) => {
    const normalizedTo = (toStatus || '').toLowerCase();
    if (normalizedTo === 'approved') return { label: 'Approved', badge: 'bg-emerald-100 text-emerald-700' };
    if (normalizedTo === 'in-review' || normalizedTo === 'review') return { label: 'In Review', badge: 'bg-amber-100 text-amber-700' };
    if (normalizedTo === 'draft' && (fromStatus || '').toLowerCase() === 'in-review') return { label: 'Rejected', badge: 'bg-rose-100 text-rose-700' };
    return { label: 'Draft', badge: 'bg-slate-100 text-slate-700' };
  };

  // Normalize statuses
  const normalizedStatus = currentStatus === 'review' ? 'in-review' : currentStatus;
  const isDraft = normalizedStatus === 'draft';
  const isInReview = normalizedStatus === 'in-review';
  const isApproved = normalizedStatus === 'approved';
  const isAssignedReviewer = isInReview && String(assignedTo) === String(userId);
  const isOwner = String(userId) === String(ownerId);

  // Fetch reviewers list on mount
  useEffect(() => {
    const fetchReviewers = async () => {
      try {
        const response = await api.get('/users/reviewers');
        setReviewers(response.data.data || []);
      } catch (err) {
        setReviewers([
          { id: 2, first_name: 'John', last_name: 'Reviewer', email: 'john@example.com' },
          { id: 3, first_name: 'Jane', last_name: 'Editor', email: 'jane@example.com' },
        ]);
      }
    };
    fetchReviewers();
  }, []);

  // Preload history so the counter is accurate without opening the accordion
  useEffect(() => {
    fetchWorkflowHistory();
  }, [brdId]);

  // Fetch workflow history
  const fetchWorkflowHistory = async () => {
    try {
      const response = await api.get(`/brd/${brdId}/workflow-history`);
      setWorkflowHistory(response.data.data || []);
    } catch (err) {
      console.error('Error fetching workflow history:', err);
    }
  };

  const handleRequestReview = async () => {
    if (!selectedReviewer) {
      setError('Please select a reviewer');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post(`/brd/${brdId}/request-review`, {
        assigned_to: selectedReviewer,
        reason: reason || undefined,
      });
      onStatusChange('in-review', { assignedTo: selectedReviewer });
      setSelectedReviewer(null);
      setReason('');
      setShowReviewerDropdown(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to request review');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post(`/brd/${brdId}/approve`, { reason: reason || undefined });
      onStatusChange('approved');
      setReason('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post(`/brd/${brdId}/reject`, { reason: reason || undefined });
      onStatusChange('draft');
      setReason('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Badge - Simple & Compact */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${isApproved ? 'bg-emerald-100 text-emerald-700' :
            isInReview ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
            }`}>
            {isApproved ? <CheckCircle size={14} /> : isInReview ? <Clock size={14} /> : <AlertCircle size={14} />}
            {isApproved ? 'Approved' : isInReview ? 'In Review' : 'Draft'}
          </div>
          {isOwner && <span className="text-[10px] font-bold text-slate-400 uppercase">Owner</span>}
        </div>
        {assignedTo && (
          <span className="text-xs text-slate-500">
            Reviewer: {
              reviewers.find(r => String(r.id) === String(assignedTo))
                ? `${reviewers.find(r => String(r.id) === String(assignedTo)).first_name} ${reviewers.find(r => String(r.id) === String(assignedTo)).last_name}`.trim()
                : `#${assignedTo}`
            }
          </span>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Draft: Send for Review */}
      {isDraft && (
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Send size={16} className="text-indigo-500" />
            Send for Review
          </div>

          <div className="relative">
            <button
              onClick={() => setShowReviewerDropdown(!showReviewerDropdown)}
              className="w-full flex items-center justify-between px-3 py-2.5 border border-slate-200 bg-white rounded-lg hover:border-slate-300 text-sm text-slate-700"
            >
              <span>
                {selectedReviewer
                  ? reviewers.find(r => r.id === selectedReviewer)?.first_name + ' ' + reviewers.find(r => r.id === selectedReviewer)?.last_name
                  : 'Select reviewer...'}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showReviewerDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showReviewerDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
                {reviewers.map((reviewer) => (
                  <button
                    key={reviewer.id}
                    onClick={() => { setSelectedReviewer(reviewer.id); setShowReviewerDropdown(false); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 text-sm border-b border-slate-100 last:border-0"
                  >
                    <div className="font-medium text-slate-800">{reviewer.first_name} {reviewer.last_name}</div>
                    <div className="text-xs text-slate-500">{reviewer.email}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Add a message (optional)..."
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            rows="2"
          />

          <button
            onClick={handleRequestReview}
            disabled={loading || !selectedReviewer}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Request Review'}
          </button>
        </div>
      )}

      {/* In Review: Reviewer Actions */}
      {isAssignedReviewer && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <Clock size={16} />
            Waiting for your decision
          </div>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Add feedback (optional)..."
            className="w-full px-3 py-2.5 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none bg-white"
            rows="2"
          />

          <div className="flex gap-3">
            <button
              onClick={handleApprove}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle size={16} />
              {loading ? '...' : 'Approve'}
            </button>
            <button
              onClick={handleReject}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-lg font-medium text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              <XCircle size={16} />
              {loading ? '...' : 'Reject'}
            </button>
          </div>
        </div>
      )}

      {/* In Review: Waiting Message (for non-reviewers) */}
      {isInReview && !isAssignedReviewer && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex items-center gap-3">
          <Clock size={18} className="text-amber-600" />
          <p className="text-sm text-amber-800">Waiting for reviewer #{assignedTo} to respond</p>
        </div>
      )}

      {/* Approved Message */}
      {isApproved && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 flex items-center gap-3">
          <CheckCircle size={18} className="text-emerald-600" />
          <div>
            <p className="text-sm font-medium text-emerald-800">Document Approved</p>
            <p className="text-xs text-emerald-600">Ready for use</p>
          </div>
        </div>
      )}

      {/* Workflow History - Collapsible */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <button
          onClick={() => {
            setShowHistory(!showHistory);
            if (!showHistory) fetchWorkflowHistory();
          }}
          className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors text-sm"
        >
          <div className="flex items-center gap-2 text-slate-700">
            <History size={16} />
            <span className="font-medium">History</span>
            <span className="text-xs text-slate-400">({workflowHistory.length})</span>
          </div>
          <ChevronUp className={`w-4 h-4 text-slate-400 transition-transform ${showHistory ? '' : 'rotate-180'}`} />
        </button>

        {showHistory && (
          <div className="border-t border-slate-100 px-3 py-2 space-y-2 max-h-56 overflow-y-auto">
            {workflowHistory.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">No history yet</p>
            ) : (
              workflowHistory.map((event, idx) => {
                const actor = event.first_name || event.last_name ? `${event.first_name || ''} ${event.last_name || ''}`.trim() : event.email || 'System';
                const { label, badge } = getStatusMeta(event.from_status, event.to_status);
                return (
                  <div key={idx} className="flex items-start gap-3 text-xs">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <ArrowRight size={12} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-700 capitalize truncate">
                          {`${event.from_status || 'Created'} -> ${event.to_status || ''}`}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge}`}>{label}</span>
                        <span className="text-slate-400 whitespace-nowrap">{formatDateTime(event.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <span className="text-[11px] font-medium">{actor}</span>
                      </div>
                      {event.reason && (
                        <p className="text-slate-600 mt-0.5 text-[11px] leading-snug break-words">{event.reason}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
