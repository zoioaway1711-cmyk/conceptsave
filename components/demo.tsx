"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, LockKeyhole, ScanLine, ShieldCheck, Sparkles } from "lucide-react";

const reveal = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } };

export function HeroScrollDemo() {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : "hidden";
  const steps = [
    ["01", "Encontre o serial", "Veja o código impresso junto ao QR Code na embalagem."],
    ["02", "Faça a consulta", "Digite o serial ou utilize a câmera do seu dispositivo."],
    ["03", "Confirme o resultado", "Receba imediatamente o estado de autenticidade do produto."],
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f8fc] text-[#102a4b]">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-[#dfe4da]/80 bg-[#f4f8fc]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-10">
          <Link href="/" className="flex items-center gap-3 font-extrabold tracking-tight">
            <Image src="/save-concept-mark-v2.png" alt="Save Concept" width={44} height={44} className="h-10 w-auto object-contain" />
            <span className="hidden sm:inline">VerificaFarma</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/usuarios" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-bold text-[#36556f] transition hover:bg-white sm:px-4">Usuários</Link>
            <Link href="/index.html" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0b54aa] px-5 text-sm font-bold text-white transition hover:bg-[#073e82]">
              Verificar <ArrowRight aria-hidden="true" size={17} />
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-5 pb-16 pt-28 md:grid-cols-[1.02fr_.98fr] md:px-10 md:pt-24">
        <div className="pointer-events-none absolute left-[-12rem] top-24 h-96 w-96 rounded-full bg-[#d7e9f8]/55 blur-3xl" />
        <motion.div initial={initial} animate="visible" transition={{ staggerChildren: 0.1 }} className="relative z-10">
          <motion.div variants={reveal} transition={{ duration: 0.55 }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#bed0e3] bg-white/80 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.17em] text-[#0b54aa] shadow-sm">
            <ShieldCheck aria-hidden="true" size={16} /> Autenticidade Save Concept
          </motion.div>
          <motion.h1 variants={reveal} transition={{ duration: 0.65 }} className="max-w-3xl text-balance text-[2.65rem] min-[360px]:text-5xl font-extrabold leading-[0.94] tracking-[-0.055em] sm:text-6xl lg:text-[5.2rem]">
            Confiança em cada <span className="text-[#0b54aa]">verificação.</span>
          </motion.h1>
          <motion.p variants={reveal} transition={{ duration: 0.65 }} className="mt-7 max-w-xl text-lg leading-8 text-[#68798c]">
            Valide o serial ou leia o QR Code para confirmar a originalidade do seu produto em poucos segundos.
          </motion.p>
          <motion.div variants={reveal} transition={{ duration: 0.65 }} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/index.html" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-[#0b54aa] px-7 font-extrabold text-white shadow-xl shadow-[#0b54aa]/20 transition hover:-translate-y-0.5 hover:bg-[#073e82]"><ScanLine size={20} /> Verificar meu produto</Link>
            <a href="#como-funciona" className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-[#d5ddd3] bg-white/75 px-7 font-bold text-[#36556f] transition hover:bg-white">Como funciona</a>
          </motion.div>
          <motion.div variants={reveal} transition={{ duration: 0.65 }} className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm font-semibold text-[#5f6e66]">
            <span className="flex items-center gap-2"><BadgeCheck size={17} className="text-[#0b54aa]" /> Consulta instantânea</span>
            <span className="flex items-center gap-2"><LockKeyhole size={17} className="text-[#0b54aa]" /> Dados protegidos</span>
          </motion.div>
        </motion.div>

        <motion.div initial={reduceMotion ? false : { opacity: 0, x: 50, rotate: 3 }} animate={{ opacity: 1, x: 0, rotate: 0 }} transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }} className="depth-stage relative mx-auto w-full max-w-[34rem]">
          <div className="absolute inset-10 rounded-full bg-[#c7dff4] blur-3xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-[radial-gradient(circle_at_80%_10%,#d9eafa,transparent_42%),linear-gradient(145deg,#fff,#eaf3fb)] p-7 shadow-[0_35px_100px_rgba(11,84,170,.2)] sm:p-10">
            <div className="schematic-grid absolute inset-0" />
            <div className="absolute left-5 top-5 font-mono text-[10px] font-bold tracking-[.18em] text-[#4f789c]">SC / AUTH—03</div>
            <div className="absolute right-5 top-5 flex items-center gap-2 font-mono text-[10px] text-[#4f789c]"><span className="h-1.5 w-1.5 rounded-full bg-[#0b54aa]" /> SISTEMA ATIVO</div>
            <motion.div animate={reduceMotion ? undefined : { y: [0, -10, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} className="flex h-[28rem] items-center justify-center sm:h-[34rem]">
              <Image src="/save-concept-tirzepatide-3d.png" alt="Produto Save Concept autenticável por serial" width={650} height={720} priority className="max-h-full w-auto object-contain drop-shadow-2xl" />
            </motion.div>
            <motion.div animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 22, repeat: Infinity, ease: "linear" }} className="pointer-events-none absolute left-1/2 top-1/2 h-[19rem] w-[19rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#4b91c7]/35 sm:h-[24rem] sm:w-[24rem]" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-4/5 -translate-x-1/2 bg-[#2783ca]/15" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-4/5 w-px -translate-y-1/2 bg-[#2783ca]/15" />
            <motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 }} className="absolute bottom-6 left-6 right-6 flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-xl backdrop-blur sm:left-8 sm:right-auto">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e4f0fb] text-[#0b54aa]"><Sparkles size={21} /></span><span><small className="block text-xs font-bold uppercase tracking-wider text-[#728078]">Resultado</small><strong className="text-[#0b54aa]">Produto original</strong></span>
            </motion.div>
          </div>
        </motion.div>
      </section>

      <section id="como-funciona" className="scroll-mt-20 border-y border-[#e0e7dd] bg-white px-5 py-20 md:px-10">
        <div className="mx-auto max-w-7xl">
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} className="max-w-xl">
            <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#0b54aa]">Simples e seguro</span><h2 className="mt-3 text-4xl font-extrabold tracking-[-0.04em] md:text-5xl">Três passos. Uma resposta clara.</h2>
          </motion.div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {steps.map(([number, title, copy], index) => <motion.article key={number} initial={reduceMotion ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ delay: index * 0.1 }} className="rounded-3xl border border-[#e1e7df] bg-[#f8faf6] p-7"><span className="text-sm font-extrabold text-[#0b54aa]">{number}</span><h3 className="mt-10 text-xl font-extrabold">{title}</h3><p className="mt-3 leading-7 text-[#68798c]">{copy}</p></motion.article>)}
          </div>
        </div>
      </section>
    </main>
  );
}
