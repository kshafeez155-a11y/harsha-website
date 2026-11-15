import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2, LoaderCircle, MapPin, Rocket, UserRound } from "lucide-react";

import { useStartupProfiles } from "@/hooks/use-startup-profiles";
import { STARTUP_STAGES } from "@/lib/startup-profiles";

export function FounderWall({ directory = false }: { directory?: boolean }) {
  const [selectedStage, setSelectedStage] = useState("All Startups");
  const { data: startups = [], isPending, isError, refetch } = useStartupProfiles();
  const filteredStartups = startups.filter(
    (startup) => selectedStage === "All Startups" || startup.stage === selectedStage,
  );
  const Heading = directory ? "h1" : "h2";

  return (
    <section
      id="founder-wall"
      className="scroll-mt-28 overflow-hidden bg-white py-14 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
              <Building2 className="h-4 w-4 shrink-0" />
              The Hanova Founder Wall
            </div>

            <Heading className="mt-5 max-w-3xl text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
              Meet the startups building{" "}
              <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                from our region
              </span>
            </Heading>

            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Explore founders and startups across different cities, industries, and stages of
              growth within the Hanova ecosystem.
            </p>
          </div>

          {!directory && (
            <Link
              to="/startups"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:border-blue-500 hover:text-blue-600 sm:w-auto"
            >
              Explore all startups
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        <div
          aria-label="Filter startups by stage"
          role="group"
          className="-mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"
        >
          {["All Startups", ...STARTUP_STAGES].map((stage) => (
            <button
              key={stage}
              type="button"
              aria-pressed={selectedStage === stage}
              onClick={() => setSelectedStage(stage)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                selectedStage === stage
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              {stage}
            </button>
          ))}
        </div>

        {isPending ? (
          <div
            role="status"
            className="mt-8 flex items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-6 py-16 text-slate-600"
          >
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Loading startups...
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 px-6 py-12 text-center"
          >
            <p className="font-semibold text-slate-900">Startups could not be loaded.</p>
            <p className="mt-2 text-sm text-slate-600">Please try again in a moment.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-5 min-h-11 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white hover:bg-blue-600"
            >
              Try again
            </button>
          </div>
        ) : filteredStartups.length === 0 ? (
          <div
            role="status"
            className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 px-6 py-16 text-center"
          >
            <Rocket className="mx-auto h-9 w-9 text-blue-600" />
            <p className="mt-4 text-lg font-bold text-slate-950">
              {startups.length === 0
                ? "New startups are on the way"
                : "No startups at this stage yet"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {startups.length === 0
                ? "Check back soon to meet more founders in our ecosystem."
                : "Choose another stage to explore our founders."}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 mt-8 flex items-center justify-between">
              <p aria-live="polite" className="text-sm font-semibold text-slate-600">
                {filteredStartups.length} {filteredStartups.length === 1 ? "startup" : "startups"}
              </p>
              <p className="text-xs text-slate-500 sm:hidden">Swipe to explore</p>
            </div>

            <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
              {filteredStartups.map((startup) => (
                <article
                  key={startup.id}
                  className="group flex min-w-[84%] snap-start flex-col rounded-[26px] border border-slate-200 bg-[#f8fafc] p-5 transition duration-300 hover:-translate-y-1 hover:border-blue-300 hover:bg-white hover:shadow-xl sm:min-w-0 sm:rounded-[28px] sm:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 text-white">
                      {startup.startupLogo || startup.coverImage ? (
                        <img
                          src={startup.startupLogo || startup.coverImage}
                          alt={`${startup.startupName} logo`}
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Rocket className="h-6 w-6" />
                      )}
                    </div>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                      {startup.stage}
                    </span>
                  </div>

                  <div className="mt-6">
                    <h3 className="break-words text-xl font-bold text-slate-950">
                      {startup.startupName}
                    </h3>
                    <p className="mt-3 min-h-[72px] whitespace-pre-line text-sm leading-6 text-slate-600">
                      {startup.shortStory}
                    </p>
                  </div>

                  <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      {startup.founderImage ? (
                        <img
                          src={startup.founderImage}
                          alt={startup.founderName ?? `Founder of ${startup.startupName}`}
                          loading="lazy"
                          width={40}
                          height={40}
                          className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 object-cover"
                        />
                      ) : (
                        <UserRound className="h-4 w-4 shrink-0 text-blue-600" />
                      )}
                      <span className="min-w-0 break-words">
                        Founder:{" "}
                        <strong className="font-semibold text-slate-900">
                          {startup.founderName}
                        </strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <MapPin className="h-4 w-4 shrink-0 text-blue-600" />
                      <span>{startup.location}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <Building2 className="h-4 w-4 shrink-0 text-blue-600" />
                      <span className="min-w-0 break-words">{startup.industry}</span>
                    </div>
                  </div>

                  <Link
                    to="/startups/$startupSlug"
                    params={{ startupSlug: startup.slug }}
                    className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-bold text-slate-950 transition group-hover:text-blue-600"
                  >
                    View startup
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </article>
              ))}
            </div>
          </>
        )}

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {!directory && (
            <Link
              to="/startups"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-7 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 sm:w-auto"
            >
              Explore all startups
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          <Link
            to="/startups/register"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-7 py-3 text-sm font-semibold text-slate-950 transition hover:border-blue-500 hover:text-blue-600 sm:w-auto"
          >
            Register your startup
          </Link>
        </div>
      </div>
    </section>
  );
}
