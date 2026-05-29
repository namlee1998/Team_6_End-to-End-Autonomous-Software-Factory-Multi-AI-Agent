import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import {
  ChevronRight,
  Sparkles,
  CheckCircle2,
  ArrowDown,
  Bot,
  Zap,
  Shield,
  Lightbulb,
  ClipboardList,
  PenTool,
  Terminal,
  ShieldCheck,
  Activity,
  UserCheck
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: 'easeOut' as const } },
};

function Navbar({ onCta, session }: { onCta: () => void; session: boolean }) {
  const navigate = useNavigate();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
      <div className="absolute inset-0 bg-[#0A0B10]/80 backdrop-blur-xl border-b border-white/5 -z-10 max-w-none" style={{ left: '50%', transform: 'translateX(-50%)', width: '100vw' }} />
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#8B5CF6] flex items-center justify-center text-white font-bold shadow-[0_0_15px_rgba(139,92,246,0.5)]">
          AI
        </div>
        <span className="font-bold text-lg tracking-wide text-white font-['Outfit']">AIDLC Platform</span>
        <span className="hidden sm:block text-[10px] font-bold tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full uppercase">Multi-Agent</span>
      </div>
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/auth')} className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
          Sign In
        </button>
        <button
          onClick={onCta}
          className="text-sm font-bold bg-[#8B5CF6] text-white px-5 py-2.5 rounded-full hover:bg-[#7C3AED] transition-all shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)] flex items-center gap-1"
        >
          {session ? 'Go to Factory' : 'Start Building'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center px-8 border-r border-white/10 last:border-0">
      <p className="text-3xl font-black text-white font-['Outfit']">{value}</p>
      <p className="text-xs uppercase tracking-widest text-slate-500 mt-1.5 font-bold">{label}</p>
    </div>
  );
}

function PipelineStep({
  step,
  icon: Icon,
  title,
  desc,
  color,
  isLast,
}: {
  step: string;
  icon: React.ElementType;
  title: string;
  desc: string;
  color: string;
  isLast: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center relative z-10">
      <div className={`w-16 h-16 rounded-2xl ${color} flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(0,0,0,0.3)] border border-white/10 relative`}>
        <div className="absolute inset-0 bg-white/5 rounded-2xl pointer-events-none" />
        <Icon className="w-7 h-7 text-white" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">{step}</span>
      <h3 className="text-[17px] font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed max-w-[200px]">{desc}</p>
      {!isLast && (
        <div className="mt-8 flex flex-col items-center gap-1 xl:hidden">
          <ArrowDown className="w-5 h-5 text-indigo-500/50" />
        </div>
      )}
    </div>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const { session } = useAuthStore();

  const handleCta = () => navigate(session ? '/sdlc' : '/auth');

  const DEMO_INPUT = `User Intent: "I want a Kanban board to track feature backlogs. It should have columns for TODO, IN_PROGRESS, REVIEW, and DONE. Users can drag and drop tasks. Must include Row Level Security so users only see their own projects."`;

  const DEMO_OUTPUT = `# Product Requirements Document (PRD)

## Feature: Agile Kanban Board

### 1. Overview
Implement a fully functional Kanban board to manage feature backlogs within a project.

### 2. User Stories
- **US01:** As a user, I can create a new backlog item so that I can track work.
- **US02:** As a user, I can drag and drop items between statuses (TODO, IN_PROGRESS, REVIEW, DONE).
- **US03:** As an admin, I can ensure RLS policies restrict visibility to project members only.

### 3. Acceptance Criteria
- [x] Board renders 4 distinct columns.
- [x] Drag and drop updates the database via Supabase Realtime.
- [x] Unauthorized users cannot fetch backlogs (401/403).`;

  return (
    <div className="bg-[#0A0B10] text-white min-h-screen font-sans antialiased overflow-x-hidden selection:bg-indigo-500/30">
      {/* ─ Ambient background glows ─ */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-0">
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-indigo-900/10 blur-[120px] rounded-full" />
        <div className="absolute top-[30%] left-[-20%] w-[600px] h-[600px] bg-violet-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-blue-900/10 blur-[100px] rounded-full" />
      </div>

      <Navbar onCta={handleCta} session={!!session} />

      {/* ━━━━━━━━━━━━ HERO ━━━━━━━━━━━━ */}
      <section className="relative z-10 pt-44 pb-32 px-6 max-w-7xl mx-auto text-center">
        <motion.div variants={fadeUp} initial="hidden" animate="visible">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-bold tracking-widest uppercase text-indigo-300 mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI-Powered SDLC Orchestration</span>
          </div>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-[56px] md:text-7xl lg:text-[88px] font-black tracking-tight leading-[1.05] mb-8 font-['Outfit']"
        >
          End-to-End <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#8B5CF6] via-[#C084FC] to-[#38BDF8]">
            Autonomous
          </span>
          <br /> Software Factory
        </motion.h1>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-lg md:text-xl text-slate-400 mb-14 max-w-3xl mx-auto font-normal leading-relaxed"
        >
          Deploy a full team of AI Agents (PO, UX, DEV, QA) to transform pure business intents into production-ready software in minutes. <strong className="text-white font-semibold">Governed by Human-in-the-Loop.</strong>
        </motion.p>

        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col sm:flex-row items-center justify-center gap-5">
          <button
            onClick={handleCta}
            className="group px-10 py-4 bg-[#8B5CF6] text-white rounded-full font-bold text-base hover:bg-[#7C3AED] transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] flex items-center gap-2"
          >
            Deploy Your First Agent
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <a
            href="#architecture"
            className="px-10 py-4 bg-white/5 text-white border border-white/10 rounded-full font-semibold hover:bg-white/10 transition-colors"
          >
            Explore Architecture ↓
          </a>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-24 inline-flex flex-col sm:flex-row items-center gap-y-6 sm:gap-y-0 bg-[#13151D]/80 backdrop-blur border border-white/5 rounded-2xl overflow-hidden py-6 shadow-2xl"
        >
          <StatItem value="5" label="Specialized Agents" />
          <StatItem value="100%" label="Audit Trail" />
          <StatItem value="Zero" label="Context Loss" />
          <StatItem value="HITL" label="Controlled" />
        </motion.div>
      </section>

      {/* ━━━━━━━━━━━━ PIPELINE DIAGRAM ━━━━━━━━━━━━ */}
      <section id="architecture" className="relative z-10 py-32 px-6 max-w-[1400px] mx-auto">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="text-center mb-24"
        >
          <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">LangGraph Pipeline</p>
          <h2 className="text-4xl md:text-5xl font-black text-white font-['Outfit']">The Supervisor-Worker Model</h2>
          <p className="text-slate-400 mt-5 max-w-2xl mx-auto text-lg">
            One Supervisor agent orchestrates a parallel workforce of specialized AI agents. You remain in control at critical Human-in-the-Loop (HITL) gates.
          </p>
        </motion.div>

        {/* Step cards with connecting lines */}
        <div className="relative">
          {/* Horizontal connector line (desktop) */}
          <div className="hidden xl:block absolute top-8 left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />

          <div className="grid grid-cols-1 xl:grid-cols-9 gap-4 items-start">
            <motion.div className="col-span-1" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              <PipelineStep
                step="01. Intent"
                icon={Lightbulb}
                title="Intent Agent"
                desc="Parses raw user requests to extract core business logic."
                color="bg-gradient-to-br from-blue-500 to-blue-700"
                isLast={false}
              />
            </motion.div>

            <div className="hidden xl:flex col-span-1 items-center justify-center pt-6">
              <ChevronRight className="w-6 h-6 text-indigo-500/50" />
            </div>

            <motion.div className="col-span-1" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, delay: 0.1 }}>
              <PipelineStep
                step="02. Product"
                icon={ClipboardList}
                title="PO Agent"
                desc="Drafts detailed PRDs and Acceptance Criteria."
                color="bg-gradient-to-br from-indigo-500 to-indigo-700"
                isLast={false}
              />
            </motion.div>

            <div className="hidden xl:flex col-span-1 items-center justify-center pt-6">
              <ChevronRight className="w-6 h-6 text-indigo-500/50" />
            </div>

            <motion.div className="col-span-1" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, delay: 0.2 }}>
              <PipelineStep
                step="03. Design"
                icon={PenTool}
                title="UX Agent"
                desc="Generates user flows and wireframe specifications."
                color="bg-gradient-to-br from-violet-500 to-violet-700"
                isLast={false}
              />
            </motion.div>
            
            <div className="hidden xl:flex col-span-1 items-center justify-center pt-6">
              <ChevronRight className="w-6 h-6 text-indigo-500/50" />
            </div>

            <motion.div className="col-span-1" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, delay: 0.3 }}>
              <PipelineStep
                step="04. Dev"
                icon={Terminal}
                title="DEV Agent"
                desc="Writes code, database schemas, and API routes."
                color="bg-gradient-to-br from-fuchsia-500 to-fuchsia-700"
                isLast={false}
              />
            </motion.div>

            <div className="hidden xl:flex col-span-1 items-center justify-center pt-6">
              <ChevronRight className="w-6 h-6 text-indigo-500/50" />
            </div>

            <motion.div className="col-span-1" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, delay: 0.4 }}>
              <PipelineStep
                step="05. QA"
                icon={ShieldCheck}
                title="QA Agent"
                desc="Validates coverage and generates test suites."
                color="bg-gradient-to-br from-rose-500 to-rose-700"
                isLast={true}
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━ CODE DEMO ━━━━━━━━━━━━ */}
      <section className="relative z-10 py-24 px-6 max-w-7xl mx-auto">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-16">
          <p className="text-sm font-bold text-violet-400 uppercase tracking-widest mb-3">Live Execution</p>
          <h2 className="text-4xl md:text-5xl font-black font-['Outfit'] text-white">Watch the Agents Work</h2>
          <p className="text-slate-400 mt-4 text-lg">From a single human prompt to a comprehensive PRD output in seconds.</p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="bg-[#0C0E15] border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        >
          {/* Terminal chrome bar */}
          <div className="flex items-center gap-2 px-5 py-4 bg-[#11131A] border-b border-white/5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
            <span className="ml-4 text-xs font-bold tracking-wider text-slate-500">AIDLC_TERMINAL</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
            {/* Left: Input */}
            <div className="bg-[#0A0B10]/50">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
                <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center">
                  <UserCheck className="w-4 h-4 text-blue-400" />
                </div>
                <span className="text-sm font-bold text-slate-300">Human Input</span>
                <span className="ml-auto text-[10px] font-bold tracking-widest text-blue-400 bg-blue-500/10 px-3 py-1 rounded border border-blue-500/20 uppercase">Intent</span>
              </div>
              <pre className="p-8 text-[15px] text-slate-300 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{DEMO_INPUT}</pre>
            </div>

            {/* Right: Output */}
            <div className="relative bg-[#0C0E15]">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
                <div className="w-8 h-8 rounded bg-indigo-500/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-indigo-400" />
                </div>
                <span className="text-sm font-bold text-slate-300">PO Agent Output</span>
                <span className="ml-auto text-[10px] font-bold tracking-widest text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded border border-indigo-500/20 uppercase">Generated</span>
              </div>
              {/* Generated badge */}
              <div className="absolute top-20 right-6 flex items-center gap-2 text-[10px] font-bold tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-full uppercase">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
                Real-time
              </div>
              <pre className="p-8 text-[14px] text-indigo-200 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{DEMO_OUTPUT}</pre>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ━━━━━━━━━━━━ FEATURES CHECKLIST ━━━━━━━━━━━━ */}
      <section className="relative z-10 py-28 px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <p className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-3">Enterprise Grade</p>
            <h2 className="text-[40px] font-black font-['Outfit'] text-white mb-8 leading-[1.1]">
              Built for Scale.<br/>Governed by Humans.
            </h2>
            <div className="space-y-6">
              {[
                { icon: Zap, text: 'Parallel Execution: Agents work simultaneously to reduce SDLC time by 90%.', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
                { icon: Shield, text: 'Risk-based Governance: High-risk code changes trigger mandatory human reviews.', color: 'text-green-400', bg: 'bg-green-400/10' },
                { icon: CheckCircle2, text: 'HITL Gates: Approve, reject, or request rework at any stage of the pipeline.', color: 'text-blue-400', bg: 'bg-blue-400/10' },
                { icon: Activity, text: 'Immutable Audit Trail: Every LLM prompt, context, and output is securely logged.', color: 'text-violet-400', bg: 'bg-violet-400/10' },
              ].map(({ icon: Icon, text, color, bg }) => (
                <div key={text} className="flex items-start gap-5">
                  <div className={`mt-1 shrink-0 p-3 rounded-xl ${bg} ${color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <p className="text-slate-300 text-lg leading-relaxed pt-1">{text}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: Workflow Card */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex flex-col gap-4">
            <div className="p-8 rounded-[24px] border border-white/10 bg-gradient-to-b from-[#13151D] to-[#0A0B10] shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[60px] rounded-full pointer-events-none" />
               <h3 className="text-2xl font-bold text-white mb-8 relative z-10 font-['Outfit']">The HITL Workflow</h3>
              {[
                { label: '01. Agents generate artifacts', tag: 'AUTOMATED', color: 'border-blue-500/20 bg-blue-500/5', tagColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
                { label: '02. Supervisor requests review', tag: 'WAITING', color: 'border-yellow-500/20 bg-yellow-500/5', tagColor: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
                { label: '03. Product Manager approves', tag: 'HUMAN', color: 'border-violet-500/20 bg-violet-500/5', tagColor: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
                { label: '04. Pipeline proceeds to deployment', tag: 'AUTOMATED', color: 'border-green-500/20 bg-green-500/5', tagColor: 'text-green-400 bg-green-500/10 border-green-500/20' },
              ].map(({ label, tag, color, tagColor }, i) => (
                <div key={label} className="relative z-10 mb-4 last:mb-0">
                  <div className={`flex items-center justify-between px-6 py-5 rounded-xl border ${color} transition-colors hover:bg-white/[0.02]`}>
                    <span className="text-[15px] font-semibold text-slate-200">{label}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest border px-3 py-1.5 rounded-full ${tagColor}`}>{tag}</span>
                  </div>
                  {i < 3 && (
                    <div className="flex justify-center py-2">
                      <ArrowDown className="w-5 h-5 text-slate-700" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━ CTA ━━━━━━━━━━━━ */}
      <section className="relative z-10 py-24 px-6 max-w-7xl mx-auto mb-20">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="relative bg-gradient-to-br from-indigo-950/80 to-violet-950/80 border border-indigo-500/30 rounded-[40px] p-16 md:p-24 text-center overflow-hidden shadow-[0_0_100px_rgba(139,92,246,0.15)]"
        >
          {/* glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none" />
          
          <p className="text-sm font-bold text-indigo-300 uppercase tracking-widest mb-6 relative z-10">Production Ready</p>
          <h2 className="text-5xl md:text-6xl font-black font-['Outfit'] text-white mb-8 relative z-10 leading-[1.1]">
            Build Software <br/>At The Speed Of Thought.
          </h2>
          <p className="text-xl text-indigo-200/80 mb-12 max-w-2xl mx-auto relative z-10">
            Join the enterprise teams orchestrating their SDLC with intelligent agents and uncompromising quality control.
          </p>
          <button
            onClick={handleCta}
            className="relative z-10 group px-12 py-5 bg-white text-black rounded-full font-bold text-[17px] hover:bg-slate-100 transition-all shadow-2xl hover:shadow-[0_0_40px_rgba(255,255,255,0.3)] flex items-center gap-3 mx-auto"
          >
            Start Your Software Factory
            <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      </section>

      {/* ━━━━━━━━━━━━ FOOTER ━━━━━━━━━━━━ */}
      <footer className="relative z-10 border-t border-white/5 py-12 px-6 bg-[#06070A]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-slate-500 font-medium">
          <div className="flex items-center gap-3">
             <div className="w-6 h-6 rounded bg-[#8B5CF6] flex items-center justify-center text-white font-bold text-[10px]">
              AI
            </div>
            <span className="font-bold text-slate-300 tracking-wide font-['Outfit'] text-base">AIDLC Platform</span>
          </div>
          <p>© {new Date().getFullYear()} Autonomous Software Factory. All rights reserved.</p>
          <div className="flex items-center gap-8">
            <button className="hover:text-white transition-colors">Documentation</button>
            <button className="hover:text-white transition-colors">Architecture</button>
            <button onClick={() => navigate('/auth')} className="hover:text-white transition-colors">Sign In</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
