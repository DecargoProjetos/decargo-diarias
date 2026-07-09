import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, ExternalLink } from 'lucide-react';
import { PEOPLE_PORTAL_URL } from '@/lib/auth';

export default function Login() {
  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-sidebar-foreground">
          <div className="bg-primary text-primary-foreground p-3 rounded-lg mb-4">
            <Building2 size={40} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">DECARGO</h1>
          <p className="text-sidebar-foreground/70 tracking-widest uppercase text-sm mt-1">
            Controle de Diárias
          </p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="space-y-1 text-center pb-4">
            <CardTitle className="text-2xl">Acesso ao Sistema</CardTitle>
            <p className="text-sm text-muted-foreground">
              Faça login no portal DECARGO People e selecione este aplicativo.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pb-8">
            <Button
              className="w-full h-11 gap-2 text-base"
              onClick={() => { window.location.href = PEOPLE_PORTAL_URL; }}
            >
              <ExternalLink size={18} />
              Acessar DECARGO People
            </Button>

            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">
                Você será redirecionado automaticamente após o login.
              </p>
              <p className="text-xs text-muted-foreground/60">
                Autenticação gerenciada pelo DECARGO ID.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
