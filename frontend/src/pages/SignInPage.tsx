import { useLocation, useNavigate } from "react-router-dom";
import { AuthPanel, type AuthMode } from "../components/AuthPanel";
import { useSession } from "../context/SessionContext";
import { paths } from "../docs/paths";
import type { User } from "../services/auth";

interface SignInPageProps {
  mode: AuthMode;
}

interface LocationState {
  from?: { pathname?: string };
}

export function SignInPage({ mode }: SignInPageProps) {
  const { setUser } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? {};

  const handleAuthenticated = (user: User) => {
    setUser(user);
    const from = state.from?.pathname;
    navigate(
      from && from !== paths.signIn && from !== paths.register
        ? from
        : paths.dashboard,
    );
  };

  return <AuthPanel mode={mode} onAuthenticated={handleAuthenticated} />;
}
