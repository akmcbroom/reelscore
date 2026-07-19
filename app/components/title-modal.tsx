/**
 * TitleModal — the inline title detail dialog. See docs/PRD.md §4.
 *
 * Fetches GET /api/title/:id when opened. URL-param driven by the parent
 * (?title=123&type=movie) so links are shareable. Uses shadcn Dialog; the
 * score lip extends above the top edge, so content overflow stays visible.
 */

import { useEffect, useState } from "react";
import { Play, User, X } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { ScoreLip, getScoreTier, getTierBorderClass } from "~/components/score-badge";
import { getImageUrl } from "~/lib/tmdb";
import type { Episode, SeasonResponse, TitleDetail } from "~/lib/schemas";
import type { ScoreBreakdown } from "~/lib/mdblist";
import { cn } from "~/lib/utils";

interface TitleModalProps {
  tmdbId: number;
  mediaType: "movie" | "tv";
  onClose: () => void;
}

export function TitleModal({ tmdbId, mediaType, onClose }: TitleModalProps) {
  const [detail, setDetail] = useState<TitleDetail | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    fetch(`/api/title/${tmdbId}?type=${mediaType}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setDetail(data as TitleDetail | null);
      })
      .catch(() => {
        if (!cancelled) onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [tmdbId, mediaType, onClose]);

  const isUnreleased = detail?.releaseDate
    ? new Date(detail.releaseDate) > new Date()
    : false;
  const tier = getScoreTier(detail?.score ?? null, isUnreleased);
  const backdropUrl = detail
    ? getImageUrl(detail.backdropPath, "backdrop", "large")
    : null;
  const logoUrl = detail
    ? getImageUrl(detail.logoPath, "logo", "original")
    : null;

  const year = detail?.releaseDate
    ? new Date(detail.releaseDate).getFullYear()
    : null;
  let runtimeDisplay: string | null = null;
  if (detail?.runtime && detail.mediaType === "movie") {
    const hrs = Math.floor(detail.runtime / 60);
    const mins = detail.runtime % 60;
    runtimeDisplay = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-2rem)] gap-0 overflow-visible p-0 sm:max-w-2xl"
      >
        {/* Accessible name even while loading */}
        <DialogTitle className="sr-only">
          {detail?.title ?? "Title details"}
        </DialogTitle>

        {!detail ? (
          <div className="p-4">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="mt-4 h-6 w-1/2" />
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="mt-6 h-20 w-full" />
          </div>
        ) : (
          // min-w-0: grid items default to min-width:auto, so the episode
          // carousel's min-content width would blow the dialog out sideways
          <div className="flex max-h-[85svh] min-w-0 flex-col">
            {/* Backdrop header */}
            <div className="relative shrink-0">
              <div
                className={cn(
                  "relative aspect-video w-full overflow-hidden rounded-t-xl border-t-4 bg-muted",
                  getTierBorderClass(tier)
                )}
              >
                {backdropUrl && (
                  <img
                    src={backdropUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                {/* Dark gradient so the overlaid text stays readable in both themes */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              </div>

              {/* Score lip — extends above the modal edge */}
              <div className="absolute -top-7 right-4 z-20">
                <ScoreLip
                  score={detail.score}
                  tmdbId={detail.tmdbId}
                  isUnreleased={isUnreleased}
                  sourceCount={detail.sourceCount}
                  breakdown={detail.breakdown as ScoreBreakdown | undefined}
                  size="modal"
                />
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-3 top-3 z-20 rounded-full bg-black/50 p-1.5 text-white/70 transition-colors hover:bg-black/70 hover:text-white"
              >
                <X className="size-5" />
              </button>

              {/* Title info overlay — always over the dark backdrop, so white text */}
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
                <div className="max-w-md">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={detail.title}
                      className="max-h-22 min-h-12 w-auto max-w-44 object-contain object-left"
                    />
                  ) : (
                    <h2 className="text-xl font-bold leading-tight text-white sm:text-2xl">
                      {detail.title}
                    </h2>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1 text-sm text-white/60">
                    <span>{detail.mediaType === "tv" ? "TV Show" : "Movie"}</span>
                    {year && (
                      <>
                        <span>•</span>
                        <span>{year}</span>
                      </>
                    )}
                    {runtimeDisplay && (
                      <>
                        <span>•</span>
                        <span>{runtimeDisplay}</span>
                      </>
                    )}
                    {detail.contentRating && (
                      <>
                        <span>•</span>
                        <span className="rounded border border-white/60 px-0.5 py-0.5 text-xs font-bold leading-none">
                          {detail.contentRating}
                        </span>
                      </>
                    )}
                  </div>

                  {detail.genres.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {detail.genres.map((g) => (
                        <Badge
                          key={g.id}
                          variant="secondary"
                          className="bg-white/10 text-white backdrop-blur"
                        >
                          {g.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {detail.overview && (
                    <button
                      type="button"
                      onClick={() => setOverviewOpen(true)}
                      title="Click to read full overview"
                      className="mt-2 line-clamp-2 cursor-pointer text-left text-sm leading-tight text-white/70 transition-colors hover:text-white/90"
                    >
                      {detail.overview}
                    </button>
                  )}

                  {(detail.trailerKey || detail.providers.length > 0) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {detail.trailerKey && (
                        <Button size="sm" onClick={() => setTrailerOpen(true)}>
                          <Play className="size-4" /> Watch Trailer
                        </Button>
                      )}
                      {detail.providers.map((p) => {
                        const logo = getImageUrl(p.logoPath, "logo", "small");
                        return logo ? (
                          <img
                            key={p.id}
                            src={logo}
                            alt={p.name}
                            title={p.name}
                            loading="lazy"
                            className="size-8 rounded-md"
                          />
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
              {detail.directors.length > 0 && (
                <div className="flex flex-col gap-3">
                  {detail.directors.map((d) => (
                    <PersonRow key={d.id} name={d.name} label="Director" profilePath={d.profilePath} />
                  ))}
                </div>
              )}

              {detail.mediaType === "tv" && detail.seasons.length > 0 && (
                <SeasonsSection
                  tvId={detail.tmdbId}
                  seasons={detail.seasons}
                  onEpisodeSelect={setEpisode}
                />
              )}

              {detail.cast.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                    Cast
                  </h3>
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {detail.cast.map((c) => (
                      <div key={c.id} className="w-20 shrink-0 text-center">
                        <PersonPhoto name={c.name} profilePath={c.profilePath} className="mx-auto size-20" />
                        <p className="mt-1.5 truncate text-xs font-medium">{c.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {c.character}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>

      {/* Trailer overlay */}
      {detail?.trailerKey && (
        <Dialog open={trailerOpen} onOpenChange={setTrailerOpen}>
          <DialogContent className="aspect-video max-w-[calc(100%-2rem)] overflow-hidden p-0 sm:max-w-3xl">
            <DialogTitle className="sr-only">Trailer</DialogTitle>
            {trailerOpen && (
              <iframe
                src={`https://www.youtube.com/embed/${detail.trailerKey}?autoplay=1`}
                title={`${detail.title} trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Full overview overlay */}
      {detail && (
        <Dialog open={overviewOpen} onOpenChange={setOverviewOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogTitle>{detail.title}</DialogTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {detail.overview}
            </p>
          </DialogContent>
        </Dialog>
      )}

      {/* Episode detail overlay */}
      {episode && detail && (
        <Dialog open onOpenChange={(open) => !open && setEpisode(null)}>
          <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
            <DialogTitle className="sr-only">{episode.name}</DialogTitle>
            <div className="relative">
              {episode.stillPath && (
                <>
                  <img
                    src={getImageUrl(episode.stillPath, "backdrop", "large") ?? undefined}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
                </>
              )}
              <div className={cn("space-y-1", episode.stillPath ? "absolute inset-x-0 bottom-0 p-4 text-white" : "p-4")}>
                <p className={cn("text-xs", episode.stillPath ? "text-white/60" : "text-muted-foreground")}>
                  {detail.title} — Season {episode.seasonNumber}, Episode {episode.episodeNumber}
                </p>
                <h3 className="text-lg font-bold">{episode.name}</h3>
                <p className={cn("text-xs", episode.stillPath ? "text-white/60" : "text-muted-foreground")}>
                  {episode.airDate &&
                    new Date(episode.airDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  {episode.runtime ? ` • ${episode.runtime}m` : ""}
                </p>
              </div>
            </div>
            {episode.overview && (
              <p className="p-4 pt-0 text-sm leading-relaxed text-muted-foreground">
                {episode.overview}
              </p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}

// --- Sub-components ---

function PersonPhoto({
  name,
  profilePath,
  className,
}: {
  name: string;
  profilePath: string | null;
  className?: string;
}) {
  const url = getImageUrl(profilePath, "profile", "medium");
  return (
    <div className={cn("overflow-hidden rounded-full bg-muted", className)}>
      {url ? (
        <img src={url} alt={name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
          <User className="size-1/2" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}

function PersonRow({
  name,
  label,
  profilePath,
}: {
  name: string;
  label: string;
  profilePath: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <PersonPhoto name={name} profilePath={profilePath} className="size-10 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{name}</p>
      </div>
    </div>
  );
}

/**
 * Seasons pill selector + episode carousel. The active season's episodes are
 * fetched from /api/season/:id on selection; the first season loads on mount.
 */
function SeasonsSection({
  tvId,
  seasons,
  onEpisodeSelect,
}: {
  tvId: number;
  seasons: TitleDetail["seasons"];
  onEpisodeSelect: (e: Episode) => void;
}) {
  const [active, setActive] = useState(seasons[0]!.seasonNumber);
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEpisodes(null);
    fetch(`/api/season/${tvId}?season=${active}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setEpisodes((data as SeasonResponse | null)?.episodes ?? []);
      })
      .catch(() => {
        if (!cancelled) setEpisodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tvId, active]);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Seasons</h3>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {seasons.map((s) => (
          <Button
            key={s.seasonNumber}
            size="sm"
            variant={s.seasonNumber === active ? "default" : "secondary"}
            className="shrink-0 rounded-full"
            onClick={() => setActive(s.seasonNumber)}
          >
            {s.seasonNumber}
          </Button>
        ))}
      </div>
      <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
        {episodes === null
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="w-40 shrink-0">
                <Skeleton className="aspect-video rounded-md" />
                <Skeleton className="mt-1.5 h-3 w-16" />
                <Skeleton className="mt-1 h-3.5 w-32" />
              </div>
            ))
          : episodes.map((e) => {
              const still = getImageUrl(e.stillPath, "backdrop", "small");
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onEpisodeSelect(e)}
                  className="w-40 shrink-0 text-left"
                >
                  <div className="aspect-video overflow-hidden rounded-md bg-muted">
                    {still && (
                      <img
                        src={still}
                        alt={e.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Episode {e.episodeNumber}
                  </p>
                  <p className="truncate text-sm font-medium">{e.name}</p>
                </button>
              );
            })}
      </div>
    </div>
  );
}
