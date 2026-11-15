import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/site/Footer";
import { FounderWall } from "@/components/site/FounderWall";
import { Navbar } from "@/components/site/Navbar";

export const Route = createFileRoute("/startups/")({
  head: () => ({ meta: [{ title: "Startups | Hanova" }] }),
  component: StartupsPage,
});

function StartupsPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-[70vh] pt-24 sm:pt-28">
        <FounderWall directory />
      </main>
      <Footer />
    </>
  );
}
