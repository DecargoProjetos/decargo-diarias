import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, LogIn } from 'lucide-react';

export default function Login() {
  const handleLogin = () => {
    window.location.href = '/api/auth/login';
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-sidebar-foreground">
          <div className="bg-primary text-primary-foreground p-3 rounded-lg mb-4">
            <Building2 size={40} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">DECARGO</h1>
          <p className="text-sidebar-foreground/70 tracking-widest uppercase text-sm mt-1">Controle de Diárias</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="space-y-1 text-center pb-6">
            <CardTitle className="text-2xl">Acesso ao Sistema</CardTitle>
            <p className="text-sm text-muted-foreground">
              Utilize suas credenciais do DECARGO ID para entrar
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Button className="w-full h-11 gap-2 text-base" onClick={handleLogin}>
              <LogIn size={18} />
              Entrar com DECARGO ID
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Autenticacao gerenciada pelo DECARGO ID. Seus dados estao protegidos.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
