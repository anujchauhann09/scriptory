import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LayoutWrapper } from './components/layout/LayoutWrapper';
import { Home } from './pages/Home';
import { Articles } from './pages/Articles';
import { ArticleDetail } from './pages/ArticleDetail';
import { About } from './pages/About';
import { Contact } from './pages/Contact';
import { NotFound } from './pages/NotFound';
import { Login } from './pages/Login';
import { WriteArticle } from './pages/WriteArticle';
import { Profile } from './pages/Profile';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
};

export default function App() {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <LayoutWrapper>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/articles" element={<Articles />} />
                <Route path="/articles/:slug" element={<ArticleDetail />} />
                <Route path="/about" element={<About />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/login" element={<Login />} />
                <Route
                  path="/write"
                  element={
                    <AdminRoute>
                      <WriteArticle />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </LayoutWrapper>
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}
