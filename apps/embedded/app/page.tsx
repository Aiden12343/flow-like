"use client";

import dynamic from "next/dynamic";

const BulltrackersFlowLikeTaskPage = dynamic(
	() =>
		import(
			"../../../packages/ui/plugins/bulltrackers/BulltrackersFlowLikeTaskPage"
		).then((mod) => mod.BulltrackersFlowLikeTaskPage),
	{ ssr: false },
);

export default function EmbeddedBulltrackersPage() {
	return <BulltrackersFlowLikeTaskPage />;
}
