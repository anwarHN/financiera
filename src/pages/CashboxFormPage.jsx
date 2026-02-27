import AccountPaymentFormPage from "./AccountPaymentFormPage";

function CashboxFormPage(props) {
  return (
    <AccountPaymentFormPage
      {...props}
      allowedKinds={["cashbox"]}
      fixedKind="cashbox"
      titleKey="actions.newCashbox"
      backPath="/cashboxes"
    />
  );
}

export default CashboxFormPage;
