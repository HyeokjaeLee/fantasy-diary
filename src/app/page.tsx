import React from "react";

export default function Page() {
  return (
    <div className="relative size-full">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute top-0 left-0 w-full h-full object-cover -z-10 blur-sm"
      >
        <source src="/videos/background.webm" type="video/webm" />
      </video>
      <article className="size-full bg-black/90">test</article>
    </div>
  );
}
