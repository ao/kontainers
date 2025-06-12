import React, { useEffect, useState } from 'react';
import { UserDTO, UserRole } from 'kontainers-shared';
import { useAuthStore } from '../../store/authStore';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserDTO | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { getAllUsers, updateUser, deleteUser, isAdmin } = useAuthStore();
  
  // Load users on component mount
  useEffect(() => {
    loadUsers();
  }, []);
  
  // Check if current user is admin
  if (!isAdmin()) {
    return (
      <div className="p-4 bg-red-50 rounded-md">
        <h3 className="text-lg font-medium text-red-800">Unauthorized</h3>
        <p className="mt-2 text-sm text-red-700">
          You do not have permission to access this page.
        </p>
      </div>
    );
  }
  
  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedUsers = await getAllUsers();
      setUsers(fetchedUsers);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };
  
  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await updateUser(userId, { role: newRole });
      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ));
    } catch (err: any) {
      setError(err.message || 'Failed to update user role');
    }
  };
  
  const handleStatusChange = async (userId: string, isActive: boolean) => {
    try {
      await updateUser(userId, { isActive });
      setUsers(users.map(user => 
        user.id === userId ? { ...user, isActive } : user
      ));
    } catch (err: any) {
      setError(err.message || 'Failed to update user status');
    }
  };
  
  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }
    
    try {
      await deleteUser(userId);
      setUsers(users.filter(user => user.id !== userId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    }
  };
  
  const openUserModal = (user: UserDTO) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }
  
  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-gray-900">Users</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all users in the system including their name, email, role and status.
          </p>
        </div>
      </div>
      
      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{error}</h3>
              <div className="mt-2 text-sm text-red-700">
                <button 
                  onClick={() => loadUsers()}
                  className="font-medium text-red-700 hover:text-red-600"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="mt-8 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                      Username
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Email
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Role
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Last Login
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                        {user.username}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {user.email}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                          className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        >
                          <option value={UserRole.ADMIN}>Admin</option>
                          <option value={UserRole.USER}>User</option>
                          <option value={UserRole.VIEWER}>Viewer</option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        <div className="flex items-center">
                          <button
                            type="button"
                            className={`${
                              user.isActive ? 'bg-green-600' : 'bg-gray-200'
                            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                            onClick={() => handleStatusChange(user.id, !user.isActive)}
                          >
                            <span
                              className={`${
                                user.isActive ? 'translate-x-5' : 'translate-x-0'
                              } inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                            />
                          </button>
                          <span className="ml-3">{user.isActive ? 'Active' : 'Inactive'}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <button
                          onClick={() => openUserModal(user)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      
      {/* User Edit Modal would go here */}
      {isModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900">Edit User</h3>
            {/* User edit form would go here */}
            <div className="mt-5 sm:mt-6">
              <button
                type="button"
                className="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-sm"
                onClick={() => setIsModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;