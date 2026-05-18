const API_URL = '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
};

export const api = {
  login: async (username, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify({ username: data.username, role: data.role, gender: data.gender }));
    return data;
  },

  signup: async (username, password, role, gender) => {
    const res = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role, gender })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getNotes: async () => {
    const res = await fetch(`${API_URL}/notes`, { headers: getAuthHeaders() });
    return res.json();
  },

  createNote: async (note) => {
    const res = await fetch(`${API_URL}/notes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(note)
    });
    return res.json();
  },

  updateNote: async (id, updates) => {
    const res = await fetch(`${API_URL}/notes/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    });
    return res.json();
  },

  deleteNote: async (id) => {
    const res = await fetch(`${API_URL}/notes/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return res.json();
  },

  uploadNoteFile: async (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/notes/${id}/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    return res.json();
  },

  deleteNoteFile: async (noteId, fileId) => {
    const res = await fetch(`${API_URL}/notes/${noteId}/files/${fileId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return res.json();
  },

  chat: async (noteId, message) => {
    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ noteId, message })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chat failed');
    return data;
  }
};
