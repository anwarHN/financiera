import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { markInvitationAccepted } from "../services/invitationsService";
import { syncBillingSeats } from "../services/billingService";

function AcceptInvitationPage() {
  const { t } = useI18n();
  const { invitationId } = useParams();
  const { user, account } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const invitedEmail = params.get("email") || "";

  useEffect(() => {
    if (!user?.email || !invitationId || !invitedEmail) {
      return;
    }

    if (user.email.toLowerCase() !== invitedEmail.toLowerCase()) {
      setError(t("admin.invitationEmailMismatch"));
      return;
    }

    processAcceptance();
  }, [user?.email, invitationId, invitedEmail, account?.accountId]);

  const processAcceptance = async () => {
    try {
      setIsProcessing(true);
      await markInvitationAccepted({ invitationId: Number(invitationId), email: invitedEmail.toLowerCase() });
      if (account?.accountId) {
        await syncBillingSeats({ accountId: account.accountId }).catch(() => null);
      }
      navigate("/");
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{t("admin.processInvitation")}</h1>
        <p>
          {t("admin.invitationId")}: <strong>{invitationId}</strong>
        </p>
        <p>
          {t("common.email")}: <strong>{invitedEmail || "-"}</strong>
        </p>
        {error && <p className="error-text">{error}</p>}

        {!user ? (
          <>
            <p>{t("admin.completeSignupFromInvitation")}</p>
            <Link to={`/register?invitationId=${invitationId}&email=${encodeURIComponent(invitedEmail)}`}>
              {t("auth.createAccount")}
            </Link>
          </>
        ) : (
          <p>{isProcessing ? t("common.loading") : t("admin.processingInvitation")}</p>
        )}
      </div>
    </div>
  );
}

export default AcceptInvitationPage;
