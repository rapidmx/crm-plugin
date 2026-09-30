///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { Deal, listDeals } from "../../crmApi.js";
import { useCrm } from "../CrmShell.js";
import { money } from "./dealUi.js";

/** The deals a contact is on, on the contact's page. */
export default function ContactDeals({ contactUid }: { contactUid: string }) {
    const { workspace, href } = useCrm();
    const [deals, setDeals] = useState<Deal[]>([]);

    useEffect(() => {
        listDeals(workspace.uid, { contactUid }).then(setDeals, () => setDeals([]));
    }, [workspace.uid, contactUid]);

    return (
        <section aria-label="Deals">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-2">Deals</h2>
            {deals.length === 0 ? (
                <p className="text-sm text-text-muted">No deals.</p>
            ) : (
                <ul className="flex flex-col gap-1 text-sm">
                    {deals.map((deal) => (
                        <li key={deal.uid} className="flex justify-between gap-2">
                            <a className="text-primary-dark hover:underline" href={href(`/crm/deals/${encodeURIComponent(deal.uid)}`)}>
                                {deal.name}
                            </a>
                            <span className="text-text-muted">
                                {money(deal.amount, deal.currency)} · {deal.status}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
