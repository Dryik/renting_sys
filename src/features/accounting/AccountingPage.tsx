import { useAuth } from "@/hooks/useAuth";
import { FullAccountingPage } from "./FullAccountingPage";
import { StaffAccountingPage } from "./StaffAccountingPage";

/**
 * Chooses which accounting screen to show.
 *
 * Staff without `accounting.view` get the reduced screen; everyone else gets
 * the full one. Keeping the decision here, and nowhere else, is what stops the
 * two screens from having to repeat it.
 */
export function AccountingPage() {
  const { can } = useAuth();

  if (!can("accounting.view")) {
    return <StaffAccountingPage />;
  }

  return <FullAccountingPage />;
}
