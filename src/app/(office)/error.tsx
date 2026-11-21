"use client";

export default function OfficeError({ error }: { error: Error }) {
  return (
    <div className="rounded-[22px] bg-white p-5">
      <h1 className="text-xl font-extrabold">The shop could not load</h1>
      <p className="mt-2 text-sm text-[#8a8496]">{error.message}</p>
      <p className="mt-3 text-sm">If this is a fresh copy, run npm run setup and start the app again.</p>
    </div>
  );
}
