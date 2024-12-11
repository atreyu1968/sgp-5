import React from 'react';
import RegisterPage from '../RegisterPage';

const GuestRegisterPage: React.FC = () => {
  return <RegisterPage expectedRole="guest" />;
};

export default GuestRegisterPage;