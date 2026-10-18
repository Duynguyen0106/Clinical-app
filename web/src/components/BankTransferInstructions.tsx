"use client";

export type BankTransferDetails = {
  accountName: string;
  sortCode: string;
  accountNumber: string;
  amountPounds: string;
  reference: string;
  currency?: "GBP";
};

type Props = {
  details: BankTransferDetails;
  /** Compact copy for manage / confirm surfaces */
  lead?: string;
};

export function BankTransferInstructionsPanel({
  details,
  lead = "Pay the deposit by bank transfer using these details. Use the exact reference so we can match your payment.",
}: Props) {
  return (
    <div className="bank-transfer-box">
      <p className="alert-line">{lead}</p>
      <dl className="bank-transfer-dl">
        <div>
          <dt>Amount</dt>
          <dd>£{details.amountPounds}</dd>
        </div>
        <div>
          <dt>Account name</dt>
          <dd>{details.accountName}</dd>
        </div>
        <div>
          <dt>Sort code</dt>
          <dd>{details.sortCode}</dd>
        </div>
        <div>
          <dt>Account number</dt>
          <dd>{details.accountNumber}</dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>
            <strong>{details.reference}</strong>
          </dd>
        </div>
      </dl>
      <p className="muted book-fineprint">
        Your booking is held once the deposit is required; the clinic will
        confirm when the transfer clears.
      </p>
    </div>
  );
}

/** Pull manage token from /book/manage/{token} (or absolute URL). */
export function manageTokenFromHref(href?: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, "https://local.invalid");
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("manage");
    if (idx < 0) return null;
    const next = parts[idx + 1];
    if (!next || next === "deposit-success") return null;
    return decodeURIComponent(next);
  } catch {
    return null;
  }
}
