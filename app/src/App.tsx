import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Hallway from './pages/Hallway';
import Login from './pages/Login';
import Notes from './pages/Notes';
import Sanctuary from './pages/Sanctuary';
import Timeline from './pages/Timeline';

function Protected({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="auth-pending">Opening the wardrobe…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Hallway /></Protected>} />
      <Route path="/notes" element={<Protected><Notes /></Protected>} />
      <Route path="/sanctuary" element={<Protected><Sanctuary /></Protected>} />
      <Route path="/timeline" element={<Protected><Timeline /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
