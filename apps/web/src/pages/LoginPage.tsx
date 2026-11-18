import AuthForm from "../components/AuthForm";
import { useLocation } from "react-router-dom";

export default function LoginPage() {
  const { state } = useLocation();
  return <>
    {typeof state?.accountNotice === "string" && <p className="notice" role="status">{state.accountNotice}</p>}
    <AuthForm mode="login" />
  </>;
}
