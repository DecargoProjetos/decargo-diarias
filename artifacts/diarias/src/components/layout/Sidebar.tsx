import { useGetMe, useLogout } from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { clearToken, PEOPLE_PORTAL_URL } from '@/lib/auth';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  UserSquare2, 
  Settings, 
  BarChart3, 
  ShieldAlert,
  LogOut,
  Building2,
  Menu
} from 'lucide-react';

export function Sidebar() {
  const { data: user } = useGetMe();
  const [location] = useLocation();
  const logout = useLogout();
  
  if (!user) return null;

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        clearToken();
        window.location.href = PEOPLE_PORTAL_URL;
      },
      onError: () => {
        // Even on error, clear token and redirect
        clearToken();
        window.location.href = PEOPLE_PORTAL_URL;
      },
    });
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['admin', 'gestor', 'prestador', 'funcionario'] },
    { name: 'Diárias', path: '/diarias', icon: FileText, roles: ['admin', 'gestor', 'prestador', 'funcionario'] },
    { name: 'Relatórios', path: '/relatorios', icon: BarChart3, roles: ['admin', 'gestor'] },
    { name: 'Equipes', path: '/equipes', icon: Building2, roles: ['admin'] },
    { name: 'Pessoas', path: '/pessoas', icon: UserSquare2, roles: ['admin'] },
    { name: 'Usuários', path: '/usuarios', icon: Users, roles: ['admin'] },
    { name: 'Auditoria', path: '/auditoria', icon: ShieldAlert, roles: ['admin'] },
  ];

  const visibleItems = navItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border text-sidebar-foreground flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-sidebar-border flex items-center gap-3">
        <div className="bg-primary text-primary-foreground p-1.5 rounded">
          <Building2 size={24} />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight tracking-tight">DECARGO</h1>
          <p className="text-xs text-sidebar-foreground/70 uppercase tracking-wider font-semibold">Diárias</p>
        </div>
      </div>
      
      <div className="flex-1 py-4 px-3 flex flex-col gap-1">
        {visibleItems.map(item => {
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
          return (
            <Link 
              key={item.path} 
              href={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon size={18} />
              {item.name}
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{user.role}</p>
          </div>
        </div>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-sidebar-foreground/70 hover:text-destructive w-full px-2 py-1.5 transition-colors rounded hover:bg-sidebar-accent/50"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </div>
  );
}
