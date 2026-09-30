///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { HttpRequest, HttpResponse, ModelUtils, RouteDecorators } from "@rapidrest/service-core";
import { EngagementType, OutboundSend } from "../models/types.js";
import { EngagementRecorder } from "../sending/Engagement.js";
import { SEND_TOKEN, TRACKING_PIXEL, isMachine, verifyClick } from "../sending/Tracking.js";
import { notFound } from "../util/WorkspaceAccess.js";
import { CrmRouteBase } from "./CrmRouteBase.js";
const { Get, Param, Query, Request, Response } = RouteDecorators;

/** How many opens, and clicks, of one message are recorded; beyond that they are served but not counted. */
export const MAX_TRACKED_OPENS = 100;
export const MAX_TRACKED_CLICKS = 500;

/**
 * The anonymous endpoints CRM email calls home through (`/api/mail/crm/t`):
 * - `GET /o/:token` - the invisible image that records an open. Always answers with the image, whatever the token.
 * - `GET /c/:token/:index?u=<url>&s=<signature>` - a tracked link: records the click and redirects to `u`. The signature
 * (`clickPath()`) must match, so the redirect only ever goes where the email's link did - a forged or changed link is a 404.
 *
 * Opens and clicks from scanners and previewers are recorded as `machine` (`isMachine()`), which statistics leave out of opens.
 */
export abstract class BaseTrackingRoute extends CrmRouteBase {
    @Get("/o/:token")
    public async open(@Param("token") token: string, @Request req: HttpRequest, @Response res: HttpResponse): Promise<void> {
        const send: OutboundSend | undefined = await this.findSend(token);
        if (send && send.openCount < MAX_TRACKED_OPENS) {
            await this.record(send, EngagementType.OPENED, { machine: isMachine(this.userAgent(req), send.sentAt) });
        }
        res.setHeader("content-type", "image/gif");
        res.setHeader("content-length", TRACKING_PIXEL.length);
        res.setHeader("cache-control", "no-store, no-cache, must-revalidate, private");
        res.status(200).send(TRACKING_PIXEL);
    }

    @Get("/c/:token/:index")
    public async click(
        @Param("token") token: string,
        @Param("index") index: string,
        @Query() query: Record<string, unknown> | undefined,
        @Request req: HttpRequest,
        @Response res: HttpResponse,
    ): Promise<void> {
        const position: number = Number(index);
        const url: unknown = query?.u;
        if (
            !SEND_TOKEN.test(token) ||
            !Number.isInteger(position) ||
            position < 0 ||
            typeof url !== "string" ||
            !/^https?:\/\//i.test(url) ||
            !verifyClick(await this.tokenSecret(), token, position, url, query?.s)
        ) {
            throw notFound();
        }
        const send: OutboundSend | undefined = await this.findSend(token);
        if (send && send.clickCount < MAX_TRACKED_CLICKS) {
            await this.record(send, EngagementType.CLICKED, { url, index: position, machine: isMachine(this.userAgent(req), send.sentAt) });
        }
        res.setHeader("cache-control", "no-store, private");
        res.setHeader("referrer-policy", "no-referrer");
        res.setHeader("location", url);
        res.status(302).end();
    }

    private async findSend(token: string): Promise<OutboundSend | undefined> {
        if (!SEND_TOKEN.test(token)) {
            return undefined;
        }
        return (await (await this.repo<OutboundSend>("outboundSend")).find({ token: ModelUtils.literal(token) }, { ignoreACL: true, limit: 1, skipCache: true }))[0];
    }

    /** Records an open or click. A failure is logged: the reader still gets the image or their link. */
    private async record(send: OutboundSend, type: EngagementType, data: Record<string, unknown>): Promise<void> {
        try {
            await new EngagementRecorder(this.repos(), this.classes, this.logger).record(send, type, data);
        } catch (err: any) {
            this.logger?.warn(`TrackingRoute: could not record a ${type} of send ${send.uid}: ${err?.message ?? err}`);
        }
    }

    private userAgent(req: HttpRequest): string | undefined {
        const value: unknown = (req as any).headers?.["user-agent"];
        return typeof value === "string" ? value : undefined;
    }
}
