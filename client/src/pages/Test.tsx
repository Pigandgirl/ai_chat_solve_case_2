import { useState } from 'react';
import axios from 'axios';

const TestAPI = () => {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testRegister = async () => {
    setLoading(true);
    setResult('Testing...');
    try {
      const response = await axios.post('http://localhost:8000/api/auth/register', {
        username: 'testuser123',
        password: '123456',
        confirmPassword: '123456',
        phone: '13900000001',
        captcha: '000000'
      });
      setResult(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      setResult('Error: ' + JSON.stringify(error.response?.data || error.message));
    }
    setLoading(false);
  };

  const testLogin = async () => {
    setLoading(true);
    setResult('Testing...');
    try {
      const response = await axios.post('http://localhost:8000/api/auth/login', {
        username: 'admin',
        password: '123456'
      });
      setResult('Login Success: ' + JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      setResult('Error: ' + JSON.stringify(error.response?.data || error.message));
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>API Test</h1>
      <button onClick={testRegister} disabled={loading}>Test Register</button>
      <button onClick={testLogin} disabled={loading}>Test Login</button>
      <pre style={{ background: '#f5f5f5', padding: '10px', marginTop: '20px' }}>{result}</pre>
    </div>
  );
};

export default TestAPI;
