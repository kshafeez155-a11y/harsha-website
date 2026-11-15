import type { HubRecord } from "@/lib/hub-management";

type HubSelectProps = {
  hubs: HubRecord[];
  value: string;
  onChange: (value: string) => void;
  loading: boolean;
  unavailable: boolean;
  onRetry: () => void;
};

export function HubSelect({
  hubs,
  value,
  onChange,
  loading,
  unavailable,
  onRetry,
}: HubSelectProps) {
  return (
    <div>
      <label htmlFor="selected-hub" className="text-sm font-bold text-slate-900">
        Choose your hub
      </label>
      <select
        id="selected-hub"
        name="hub_id"
        required
        value={hubs.some((hub) => hub.id === value) ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading || unavailable || hubs.length === 0}
        className="mt-2 min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
      >
        <option value="">{loading ? "Loading hubs..." : "Select a Hanova hub"}</option>
        {hubs.map((hub) => (
          <option key={hub.id} value={hub.id}>
            {hub.city}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        The team at this hub will handle your request. Your home city can be different.
      </p>
      {unavailable && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          We could not load the hubs.{" "}
          <button type="button" onClick={onRetry} className="font-bold underline">
            Try again
          </button>
        </p>
      )}
      {!loading && !unavailable && hubs.length === 0 && (
        <p role="status" className="mt-2 text-sm text-slate-600">
          Hub registration is temporarily unavailable. Please try again later.
        </p>
      )}
    </div>
  );
}

export function HubDataNotice({
  loading,
  unavailable,
  onRetry,
}: {
  loading: boolean;
  unavailable: boolean;
  onRetry: () => void;
}) {
  if (!loading && !unavailable) return null;
  return (
    <div
      role={unavailable ? "alert" : "status"}
      className="my-8 rounded-2xl border border-slate-200 bg-white p-6 text-slate-600"
    >
      {unavailable
        ? "We could not load this information. Please try again."
        : "Loading the latest information..."}
      {unavailable && (
        <button type="button" onClick={onRetry} className="ml-3 font-bold text-blue-700 underline">
          Try again
        </button>
      )}
    </div>
  );
}
