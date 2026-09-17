import { useNavigate } from "react-router-dom";
import { AccountPanel } from "../components/AccountPanel";
import { useSession } from "../context/SessionContext";
import { paths } from "../docs/paths";

export function AccountPage() {
  const { user, setUser } = useSession();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <AccountPanel
      user={user}
      onDeleted={() => {
        setUser(null);
        navigate(paths.review);
      }}
    />
  );
}
