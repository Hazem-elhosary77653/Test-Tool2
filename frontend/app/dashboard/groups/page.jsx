'use client';

import { useState, useEffect } from 'react';
import Notifications from '@/components/Notifications';
import SendNotificationForm from '@/components/SendNotificationForm';
import { useAuthStore } from '@/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import api from '@/lib/api';

export default function GroupsPage() {
  const user = useAuthStore((s) => s.user);
  const [groups, setGroups] = useState([]);
  const [myGroups, setMyGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showMembersModal, setShowMembersModal] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  const [memberForm, setMemberForm] = useState({
    userId: '',
    role: 'member'
  });

  useEffect(() => {
    fetchGroups();
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    try {
      const response = await api.get('/profile/me');
      setUserRole(response.data.data.role);
    } catch (err) {
      console.error('Error fetching user role:', err);
    }
  };

  const fetchGroups = async () => {
    try {
      // Get all groups (if admin)
      try {
        const allGroupsRes = await api.get('/groups');
        setGroups(allGroupsRes.data.data);
      } catch (err) {
        setGroups([]);
      }

      // Get user's groups
      const myGroupsRes = await api.get('/groups/my-groups');
      setMyGroups(myGroupsRes.data.data);

      setError('');
    } catch (err) {
      setError('Failed to fetch groups');
      console.error('Groups fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      setError('Group name is required');
      return;
    }

    try {
      const response = await api.post('/groups', formData);
      setGroups([response.data.data, ...groups]);
      setSuccess('Group created successfully');
      setError('');
      setFormData({ name: '', description: '' });
      setShowCreateForm(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create group');
      console.error('Create group error:', err);
    }
  };

  const fetchGroupMembers = async (groupId) => {
    try {
      const response = await api.get(`/groups/${groupId}/members`);
      setSelectedGroup({
        ...selectedGroup,
        members: response.data.data
      });
    } catch (err) {
      setError('Failed to fetch group members');
      console.error('Fetch members error:', err);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!memberForm.userId) {
      setError('User ID is required');
      return;
    }

    try {
      const response = await api.post(`/groups/${selectedGroup.id}/members`, memberForm);
      await fetchGroupMembers(selectedGroup.id);
      setSuccess('Member added successfully');
      setError('');
      setMemberForm({ userId: '', role: 'member' });
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add member');
      console.error('Add member error:', err);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Remove this member from the group?')) {
      return;
    }

    try {
      await api.delete(`/groups/${selectedGroup.id}/members/${memberId}`);
      await fetchGroupMembers(selectedGroup.id);
      setSuccess('Member removed successfully');
      setError('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to remove member');
      console.error('Remove member error:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-semibold">Loading groups...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {/* نموذج إرسال إشعار عبر الإيميل (للمدير فقط) */}
      {userRole === 'admin' && <div className="mb-8"><SendNotificationForm /></div>}
      {/* Notifications */}
      {user?.id && <div className="mb-8"><Notifications userId={user.id} /></div>}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">User Groups</h1>
        {userRole === 'admin' && (
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : 'Create Group'}
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mb-4 bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Create Group Form */}
      {showCreateForm && userRole === 'admin' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create New Group</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Group Name</label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Engineering Team"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description for the group"
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit">Create Group</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* My Groups */}
      {myGroups.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>My Groups</CardTitle>
            <CardDescription>Groups you are a member of</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myGroups.map((group) => (
                <div key={group.id} className="p-4 border rounded-lg">
                  <h3 className="font-semibold">{group.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{group.description}</p>
                  <div className="mt-3">
                    <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                      {group.user_role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Groups (Admin) */}
      {userRole === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle>All Groups</CardTitle>
            <CardDescription>Manage all user groups</CardDescription>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No groups created yet</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groups.map((group) => (
                  <div key={group.id} className="p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold">{group.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">{group.description}</p>
                        <div className="mt-3 flex gap-2">
                          <span className="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                            {group.member_count || 0} members
                          </span>
                          <span className="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                            Created: {new Date(group.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedGroup(group);
                          setShowMembersModal(true);
                          fetchGroupMembers(group.id);
                        }}
                      >
                        Manage
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Members Modal */}
      {showMembersModal && selectedGroup && (
        <Card className="fixed inset-0 z-50 m-auto max-w-2xl max-h-96 overflow-y-auto">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{selectedGroup.name} - Members</CardTitle>
                <CardDescription>Manage group members</CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowMembersModal(false)}
              >
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add Member Form */}
            <form onSubmit={handleAddMember} className="p-4 bg-gray-50 rounded-lg space-y-3">
              <h4 className="font-semibold">Add Member</h4>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="User ID"
                  value={memberForm.userId}
                  onChange={(e) => setMemberForm({ ...memberForm, userId: e.target.value })}
                />
                <select
                  value={memberForm.role}
                  onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
                  className="border rounded px-2"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <Button type="submit">Add</Button>
              </div>
            </form>

            {/* Members List */}
            <div>
              <h4 className="font-semibold mb-3">Current Members</h4>
              <div className="space-y-2">
                {selectedGroup.members?.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{member.email}</p>
                      <p className="text-sm text-gray-600">{member.first_name} {member.last_name}</p>
                      <span className="inline-block text-xs bg-blue-100 text-blue-800 px-2 py-1 mt-1 rounded">
                        {member.role}
                      </span>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveMember(member.user_id)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showMembersModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setShowMembersModal(false)}
        />
      )}
    </div>
  );
}
