import React from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export const LayoutWrapper = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground transition-colors duration-300">
      <Navbar />
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -20 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}
          className="flex-1"
        >
          {children}
        </motion.main>
      </AnimatePresence>
      <Footer />
    </div>
  );
};
