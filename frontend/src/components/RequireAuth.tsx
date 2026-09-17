import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useSession } from "../context/SessionContext";
import { paths } from "../docs/paths";

export function RequireAuth() {
  const { user, isSessionLoading } = useSession();
  const location = useLocation();

  if (isSessionLoading) {
    return (
      <div className="route-loading">
        <LoaderCircle className="spin" size={24} />
      </div>
    );
  }
  if (!user) {
    return <Navigate to={paths.signIn} replace state={{ from: location }} />;
  }
  return <Outlet />;
}
