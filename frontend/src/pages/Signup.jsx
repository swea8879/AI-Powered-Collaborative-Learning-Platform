import React, { useState } from 'react';
import { api } from '../api';
import { useNavigate, Link } from 'react-router-dom';

export default function Signup() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [gender, setGender] = useState('male');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Password validation regex: 1 capital, 1 number, 1 special char, min 8 chars
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    
    if (!passwordRegex.test(password)) {
      setError('Password must be at least 8 characters long and contain at least one uppercase letter, one number, and one special character.');
      return;
    }

    try {
      await api.signup(username, password, role, gender);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message || 'Signup failed. Username might already exist.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Create Account</h1>
        <p className="auth-subtitle">Join our note-sharing community</p>
        
        {error && <p style={{ color: 'var(--accent)', marginBottom: '1rem' }}>{error}</p>}
        {success && <p style={{ color: '#10b981', marginBottom: '1rem' }}>Account created! Redirecting to login...</p>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input 
              type="text" 
              className="form-input" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="••••••••"
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              Must be 8+ chars with 1 capital, 1 number, and 1 special symbol (@$!%*?&)
            </p>
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select 
              className="form-input" 
              value={role} 
              onChange={(e) => setRole(e.target.value)}
              style={{ background: '#1e293b' }}
            >
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
              <option value="admin">College Administration</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Gender</label>
            <select 
              className="form-input" 
              value={gender} 
              onChange={(e) => setGender(e.target.value)}
              style={{ background: '#1e293b' }}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <button type="submit" className="btn">Sign Up</button>
        </form>
        
        <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: '600' }}>Log In</Link>
        </p>
      </div>
    </div>
  );
}
