import { useState } from 'react';
import { useGetMe } from '@workspace/api-client-react';
import { Settings2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConfigDiariaTypes from '@/components/ConfigDiariaTypes';
import ConfigCompetencePeriods from '@/components/ConfigCompetencePeriods';

export default function Configuracoes() {
  const { data: me } = useGetMe();

  if (me?.role !== 'admin') {
    return <div className="p-8 text-destructive">Acesso restrito a administradores.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Settings2 size={28} /> Configurações
          </h1>
          <p className="text-muted-foreground mt-1">Parâmetros do sistema. Acesso restrito a administradores.</p>
        </div>
      </div>

      <Tabs defaultValue="tipos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tipos">Tipos de Diária</TabsTrigger>
          <TabsTrigger value="competencia">Períodos de Competência</TabsTrigger>
        </TabsList>

        <TabsContent value="tipos">
          <ConfigDiariaTypes />
        </TabsContent>

        <TabsContent value="competencia">
          <ConfigCompetencePeriods />
        </TabsContent>
      </Tabs>
    </div>
  );
}
