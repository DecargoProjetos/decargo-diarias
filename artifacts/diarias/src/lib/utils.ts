import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '---';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '---';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '---';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export const statusColors: Record<string, string> = {
  pendente_aprovacao: 'bg-orange-100 text-orange-800 border-orange-200',
  em_analise: 'bg-blue-100 text-blue-800 border-blue-200',
  aprovada: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejeitada: 'bg-red-100 text-red-800 border-red-200',
  solicitacao_correcao: 'bg-purple-100 text-purple-800 border-purple-200',
  disponivel_exportacao: 'bg-teal-100 text-teal-800 border-teal-200',
  exportada: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  paga: 'bg-green-200 text-green-900 border-green-300',
  cancelada: 'bg-slate-100 text-slate-800 border-slate-200',
};

export const statusLabels: Record<string, string> = {
  pendente_aprovacao: 'Pendente',
  em_analise: 'Em Análise',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  solicitacao_correcao: 'Correção',
  disponivel_exportacao: 'P/ Exportar',
  exportada: 'Exportada',
  paga: 'Paga',
  cancelada: 'Cancelada',
};
