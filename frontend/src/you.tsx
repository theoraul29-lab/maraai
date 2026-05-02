import React from 'react';
import { useAuth } from './contexts/AuthContext';
import YouProfile from './components/YouProfile';

const You: React.FC = () => {
  const { user } = useAuth();

  return <YouProfile userName={user?.name || 'User'} />;
};

export default You;
