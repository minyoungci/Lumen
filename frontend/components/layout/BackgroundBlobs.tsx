"use client";

import { motion } from "framer-motion";

export function BackgroundBlobs() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full blur-[100px] opacity-[0.18]"
        style={{
          background: "radial-gradient(circle, #0070F3, transparent)",
          top: "-100px",
          left: "-100px",
        }}
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -30, 20, 0],
          scale: [1, 1.05, 0.95, 1],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-[0.18]"
        style={{
          background: "radial-gradient(circle, #8B5CF6, transparent)",
          top: "30%",
          right: "-80px",
        }}
        animate={{
          x: [0, -20, 30, 0],
          y: [0, 20, -30, 0],
          scale: [1, 0.95, 1.05, 1],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: -8 }}
      />
      <motion.div
        className="absolute w-[350px] h-[350px] rounded-full blur-[100px] opacity-[0.18]"
        style={{
          background: "radial-gradient(circle, #06B6D4, transparent)",
          bottom: "-80px",
          left: "40%",
        }}
        animate={{
          x: [0, 20, -20, 0],
          y: [0, -20, 20, 0],
          scale: [1, 1.03, 0.97, 1],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: -15 }}
      />
    </div>
  );
}
