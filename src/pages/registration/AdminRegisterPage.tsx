import React from 'react';
import RegisterPage from '../RegisterPage';

const AdminRegisterPage: React.FC = () => {
  return <RegisterPage expectedRole="admin" />;
};

export default AdminRegisterPage;