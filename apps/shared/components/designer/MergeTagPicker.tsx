///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ChangeEvent } from "react";
import type { MergeTag } from "../../crmApi.js";

/**
 * A menu of merge tags ("First name", "Unsubscribe link"...): picking one calls `onPick` with its tag (`contact.first_name`) and resets
 * the menu, ready for the next.
 */
export default function MergeTagPicker({ tags, onPick, label = "Insert merge tag" }: { tags: MergeTag[]; onPick: (tag: string) => void; label?: string }) {
    function pick(event: ChangeEvent<HTMLSelectElement>): void {
        const tag: string = event.target.value;
        event.target.value = "";
        if (tag) {
            onPick(tag);
        }
    }

    return (
        <select aria-label={label} defaultValue="" onChange={pick} className="text-xs py-1 px-1.5 border border-border rounded-sm bg-surface text-text max-w-[11rem]">
            <option value="">{"{{ }}"} Merge tag&hellip;</option>
            {tags.map(({ tag, label: tagLabel }) => (
                <option key={tag} value={tag}>
                    {tagLabel}
                </option>
            ))}
        </select>
    );
}
