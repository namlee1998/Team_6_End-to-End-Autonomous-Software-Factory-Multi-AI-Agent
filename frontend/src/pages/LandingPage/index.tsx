import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import {
  ChevronRight,
  FileText,
  Code2,
  Sparkles,
  CheckCircle2,
  ArrowDown,
  Upload,
  Bot,
  Download,
  Zap,
  Shield,
  Layers,
  Clock,
} from 'lucide-react';

// ── Animation helpers ────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: 'easeOut' as const } },
};

// ── Subcomponents ────────────────────────────────────────────────────────────

function Navbar({ onCta, session }: { onCta: () => void; session: boolean }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
      {/* glass pill */}
      <div className="absolute inset-0 bg-[#0a0a0a]/70 backdrop-blur-xl border-b border-white/5 -z-10 max-w-none" style={{ left: '50%', transform: 'translateX(-50%)', width: '100vw' }} />
      <div className="flex items-center gap-2.5">
        <img src="/favicon.svg" alt="logo" className="w-8 h-8" />
        <span className="font-headline font-bold text-base tracking-tight text-white">Mobile Auto</span>
        <span className="hidden sm:block text-[10px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">AI-Powered</span>
      </div>
      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <button onClick={() => navigate('/auth')} className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
          {t('nav.signIn')}
        </button>
        <button
          onClick={onCta}
          className="text-sm font-semibold bg-white text-black px-4 py-2 rounded-full hover:bg-slate-100 transition-all hover:shadow-lg hover:shadow-white/10 flex items-center gap-1"
        >
          {session ? t('nav.goToApp') : t('nav.getStarted')}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center px-8 border-r border-white/10 last:border-0">
      <p className="text-3xl font-headline font-extrabold text-white">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
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
    <div className="flex flex-col items-center text-center">
      <div className={`w-16 h-16 rounded-2xl ${color} flex items-center justify-center mb-4 shadow-lg`}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{step}</span>
      <h3 className="text-lg font-bold font-headline text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed max-w-[200px]">{desc}</p>
      {!isLast && (
        <div className="mt-6 flex flex-col items-center gap-1 md:hidden">
          <ArrowDown className="w-5 h-5 text-slate-600" />
        </div>
      )}
    </div>
  );
}

function InputDocCard({ icon: Icon, title, desc, accent }: { icon: React.ElementType; title: string; desc: string; accent: string }) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300 }}
      className="bg-[#111] border border-white/8 rounded-2xl p-6 flex flex-col gap-3 hover:border-white/15 transition-colors"
    >
      <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <h4 className="text-base font-bold text-white font-headline">{title}</h4>
      <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function LandingPage() {
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const { t } = useTranslation();

  const handleCta = () => navigate(session ? '/app' : '/auth');

  const PRD_MOCK = `Feature: Add Transaction

Scenario: User adds a valid expense
  - User opens the app
  - Taps the "+" button on Home screen  
  - Enters amount: 150,000
  - Selects category: "Food"
  - Taps "Save"
  
Expected: Transaction appears in list`;

  const YAML_MOCK = `test_cases:
  - name: "TC_ADD_001_valid_expense"
    steps:
      - tap:
          id: "btn_add_transaction"
      - input:
          id: "input_amount"
          text: "150000"
      - select:
          id: "picker_category"
          value: "Food"
      - tap:
          id: "btn_save"
      - assert:
          id: "list_transactions"
          state: "contains_item"`;

  return (
    <div className="bg-[#080808] text-white min-h-screen font-body antialiased overflow-x-hidden">
      {/* ─ Ambient background blobs ─ */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-0">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-blue-600/15 blur-[140px] rounded-full" />
        <div className="absolute top-[40%] right-[-200px] w-[500px] h-[500px] bg-violet-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[10%] left-[-100px] w-[400px] h-[400px] bg-indigo-600/10 blur-[100px] rounded-full" />
      </div>

      <Navbar onCta={handleCta} session={!!session} />

      {/* ━━━━━━━━━━━━ HERO ━━━━━━━━━━━━ */}
      <section className="relative z-10 pt-40 pb-28 px-6 max-w-7xl mx-auto text-center">
        <motion.div variants={fadeUp} initial="hidden" animate="visible">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300 mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('landing.badgeAI')}</span>
          </div>
        </motion.div>

        <motion.h1
         
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-5xl md:text-7xl lg:text-8xl font-headline font-extrabold tracking-tight leading-[1.05] mb-8"
        >
          {t('landing.titleMain')}
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400">
            {t('landing.titleHighlight')}
          </span>
        </motion.h1>

        <motion.p
         
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-lg md:text-xl text-slate-400 mb-12 max-w-2xl mx-auto font-light leading-relaxed"
        >
          {t('landing.subtitleMain')}{' '}
          <span className="text-white font-medium">{t('landing.subtitleHighlight')}</span>
          {' '}{t('landing.subtitleEnd')}
        </motion.p>

        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={handleCta}
            className="group px-8 py-4 bg-white text-black rounded-full font-bold text-base hover:bg-slate-100 transition-all hover:shadow-2xl hover:shadow-white/10 flex items-center gap-2"
          >
            {t('landing.startBtn')}
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <a
            href="#how-it-works"
            className="px-8 py-4 bg-white/5 text-white border border-white/10 rounded-full font-semibold hover:bg-white/10 transition-colors"
          >
            {t('landing.howItWorksBtn')} ↓
          </a>
        </motion.div>

        {/* Stats bar */}
        <motion.div
         
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-20 inline-flex items-center bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden"
        >
          <StatItem value="3" label={t('landing.stats.agents')} />
          <StatItem value="< 30s" label={t('landing.stats.time')} />
          <StatItem value="100%" label={t('landing.stats.spec')} />
          <StatItem value="0" label={t('landing.stats.effort')} />
        </motion.div>
      </section>

      {/* ━━━━━━━━━━━━ PIPELINE DIAGRAM ━━━━━━━━━━━━ */}
      <section id="how-it-works" className="relative z-10 py-28 px-6 max-w-7xl mx-auto">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="text-center mb-20"
        >
          <p className="text-sm font-semibold text-blue-400 uppercase tracking-widest mb-3">{t('landing.pipeline.tag')}</p>
          <h2 className="text-4xl md:text-5xl font-headline font-bold text-white">{t('landing.pipeline.title')}</h2>
          <p className="text-slate-400 mt-4 max-w-xl mx-auto">
            {t('landing.pipeline.subtitle')}
          </p>
        </motion.div>

        {/* Step cards with connecting lines */}
        <div className="relative">
          {/* Horizontal connector line (desktop) */}
          <div className="hidden md:block absolute top-8 left-1/2 -translate-x-1/2 w-[68%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          <div className="grid grid-cols-1 md:grid-cols-5 gap-0 items-start">
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              <PipelineStep
                step="Agent 01"
                icon={FileText}
                title={t('landing.pipeline.agent1.title')}
                desc={t('landing.pipeline.agent1.desc')}
                color="bg-gradient-to-br from-blue-500 to-blue-700 shadow-blue-500/30"
                isLast={false}
              />
            </motion.div>

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center pt-6">
              <ChevronRight className="w-6 h-6 text-slate-600" />
            </div>

            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              <PipelineStep
                step="Agent 02"
                icon={Bot}
                title={t('landing.pipeline.agent2.title')}
                desc={t('landing.pipeline.agent2.desc')}
                color="bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-indigo-500/30"
                isLast={false}
              />
            </motion.div>

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center pt-6">
              <ChevronRight className="w-6 h-6 text-slate-600" />
            </div>

            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              <PipelineStep
                step="Agent 03"
                icon={Code2}
                title={t('landing.pipeline.agent3.title')}
                desc={t('landing.pipeline.agent3.desc')}
                color="bg-gradient-to-br from-violet-500 to-violet-700 shadow-violet-500/30"
                isLast={true}
              />
            </motion.div>
          </div>
        </div>

        {/* Input → Output flow */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-16 flex flex-col md:flex-row items-center justify-center gap-4 text-sm"
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-300">
            <Upload className="w-4 h-4" /> {t('landing.pipeline.flowInput')}
          </div>
          <ChevronRight className="w-5 h-5 text-slate-600 hidden md:block" />
          <div className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-300">
            <Download className="w-4 h-4" /> {t('landing.pipeline.flowOutput')}
          </div>
        </motion.div>
      </section>

      {/* ━━━━━━━━━━━━ INPUT DOCUMENTS ━━━━━━━━━━━━ */}
      <section className="relative z-10 py-28 px-6 max-w-7xl mx-auto">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-16">
          <p className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-3">{t('landing.documents.tag')}</p>
          <h2 className="text-4xl md:text-5xl font-headline font-bold">{t('landing.documents.title')}</h2>
          <p className="text-slate-400 mt-4 max-w-xl mx-auto">
            {t('landing.documents.subtitle')}
          </p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <InputDocCard
              icon={FileText}
              title={t('landing.documents.prd.title')}
              desc={t('landing.documents.prd.desc')}
              accent="bg-gradient-to-br from-blue-500 to-cyan-500"
            />
          </motion.div>
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <InputDocCard
              icon={Layers}
              title={t('landing.documents.flow.title')}
              desc={t('landing.documents.flow.desc')}
              accent="bg-gradient-to-br from-indigo-500 to-purple-500"
            />
          </motion.div>
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <InputDocCard
              icon={Bot}
              title={t('landing.documents.ui.title')}
              desc={t('landing.documents.ui.desc')}
              accent="bg-gradient-to-br from-violet-500 to-pink-500"
            />
          </motion.div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━ CODE DEMO ━━━━━━━━━━━━ */}
      <section className="relative z-10 py-28 px-6 max-w-7xl mx-auto">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-16">
          <p className="text-sm font-semibold text-violet-400 uppercase tracking-widest mb-3">{t('landing.demo.tag')}</p>
          <h2 className="text-4xl md:text-5xl font-headline font-bold">{t('landing.demo.title')}</h2>
          <p className="text-slate-400 mt-4">{t('landing.demo.subtitle')}</p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="bg-[#0d0d0d] border border-white/8 rounded-3xl overflow-hidden shadow-2xl"
        >
          {/* Terminal chrome bar */}
          <div className="flex items-center gap-2 px-5 py-3.5 bg-[#141414] border-b border-white/5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
            <span className="ml-3 text-xs font-mono text-slate-500">{t('landing.demo.terminal')}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
            {/* Left: PRD input */}
            <div>
              <div className="flex items-center gap-2 px-5 py-3 bg-[#111] border-b border-white/5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-mono text-slate-500">user_flow.prd</span>
                <span className="ml-auto text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded">{t('landing.demo.inputTag')}</span>
              </div>
              <pre className="p-6 text-sm text-slate-300 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{PRD_MOCK}</pre>
            </div>

            {/* Right: YAML output */}
            <div className="relative">
              <div className="flex items-center gap-2 px-5 py-3 bg-[#111] border-b border-white/5">
                <Code2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-mono text-blue-400">TC_ADD_001.yaml</span>
                <span className="ml-auto text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">{t('landing.demo.outputTag')}</span>
              </div>
              {/* Generated badge */}
              <div className="absolute top-12 right-4 flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded-full">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                {t('landing.demo.aiGenerated')}
              </div>
              <pre className="p-6 text-sm text-blue-200 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{YAML_MOCK}</pre>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ━━━━━━━━━━━━ FEATURES CHECKLIST ━━━━━━━━━━━━ */}
      <section className="relative z-10 py-28 px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <p className="text-sm font-semibold text-blue-400 uppercase tracking-widest mb-3">{t('landing.enterprise.tag')}</p>
            <h2 className="text-4xl font-headline font-bold mb-8 leading-tight whitespace-pre-line">
              {t('landing.enterprise.title')}
            </h2>
            <div className="space-y-5">
              {[
                { icon: Zap, text: t('landing.enterprise.feature1'), color: 'text-yellow-400' },
                { icon: Shield, text: t('landing.enterprise.feature2'), color: 'text-green-400' },
                { icon: CheckCircle2, text: t('landing.enterprise.feature3'), color: 'text-blue-400' },
                { icon: Clock, text: t('landing.enterprise.feature4'), color: 'text-violet-400' },
                { icon: Layers, text: t('landing.enterprise.feature5'), color: 'text-pink-400' },
              ].map(({ icon: Icon, text, color }) => (
                <div key={text} className="flex items-start gap-4">
                  <div className={`mt-0.5 shrink-0 ${color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="text-slate-300 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: mini pipeline visualization */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="flex flex-col gap-3">
            {[
              { label: t('landing.enterprise.miniPipeline.step1'), tag: t('landing.enterprise.miniPipeline.tags.input'), color: 'border-blue-500/30 bg-blue-500/5', tagColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
              { label: t('landing.enterprise.miniPipeline.step2'), tag: t('landing.enterprise.miniPipeline.tags.processing'), color: 'border-indigo-500/30 bg-indigo-500/5', tagColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
              { label: t('landing.enterprise.miniPipeline.step3'), tag: t('landing.enterprise.miniPipeline.tags.processing'), color: 'border-violet-500/30 bg-violet-500/5', tagColor: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
              { label: t('landing.enterprise.miniPipeline.step4'), tag: t('landing.enterprise.miniPipeline.tags.output'), color: 'border-green-500/30 bg-green-500/5', tagColor: 'text-green-400 bg-green-500/10 border-green-500/20' },
            ].map(({ label, tag, color, tagColor }, i) => (
              <div key={label}>
                <div className={`flex items-center justify-between px-5 py-4 rounded-xl border ${color}`}>
                  <span className="text-sm font-medium text-slate-200">{label}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider border px-2 py-1 rounded-full ${tagColor}`}>{tag}</span>
                </div>
                {i < 3 && (
                  <div className="flex justify-center py-1">
                    <ArrowDown className="w-4 h-4 text-slate-700" />
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━ CTA ━━━━━━━━━━━━ */}
      <section className="relative z-10 py-16 px-6 max-w-7xl mx-auto mb-16">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="relative bg-gradient-to-br from-blue-950/80 to-violet-950/80 border border-blue-500/20 rounded-[32px] p-12 md:p-20 text-center overflow-hidden"
        >
          {/* glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600/20 blur-[80px] rounded-full pointer-events-none" />
          <p className="text-sm font-semibold text-blue-400 uppercase tracking-widest mb-4 relative z-10">{t('landing.cta.ready')}</p>
          <h2 className="text-4xl md:text-5xl font-headline font-bold mb-5 relative z-10">
            {t('landing.cta.title')}
          </h2>
          <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto relative z-10">
            {t('landing.cta.subtitle')}
          </p>
          <button
            onClick={() => useAuthStore.getState().session ? window.location.assign('/app') : window.location.assign('/auth')}
            className="relative z-10 group px-10 py-4 bg-white text-black rounded-full font-bold text-base hover:bg-slate-100 transition-all hover:shadow-2xl hover:shadow-white/10 flex items-center gap-2 mx-auto"
          >
            {t('landing.cta.startBtn')}
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      </section>

      {/* ━━━━━━━━━━━━ FOOTER ━━━━━━━━━━━━ */}
      <footer className="relative z-10 border-t border-white/5 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="logo" className="w-4 h-4" />
            <span className="font-headline font-bold text-slate-400">Mobile Auto</span>
          </div>
          <p>{t('landing.footer.copyright')}</p>
          <div className="flex items-center gap-6">
            <button className="hover:text-slate-400 transition-colors">{t('landing.footer.docs')}</button>
            <button className="hover:text-slate-400 transition-colors">{t('landing.footer.architecture')}</button>
            <button onClick={() => window.location.assign('/auth')} className="hover:text-slate-400 transition-colors">{t('landing.footer.signIn')}</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
