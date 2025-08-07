import React from 'react';

export default function Page() {
  return (
    <div className="relative size-full">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute left-0 top-0 -z-10 h-full w-full object-cover blur-sm"
      >
        <source src="/videos/background.webm" type="video/webm" />
      </video>
      <article className="size-full bg-black/90">test</article>
    </div>
  );
}
