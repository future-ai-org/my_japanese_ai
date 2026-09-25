import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { parseDocHash } from "../docs/pages";
import { docPath } from "../docs/paths";

export function HashToDocsRedirect() {
  const navigate = useNavigate();
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash.startsWith("#docs/")) return;
    const parsed = parseDocHash(hash);
    navigate(
      { pathname: docPath(parsed.pageId, parsed.headingId), hash: "" },
      { replace: true },
    );
  }, [hash, navigate]);

  return null;
}
