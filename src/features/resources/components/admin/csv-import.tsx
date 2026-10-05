"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, MapPin, RotateCcw, Upload, XCircle } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { previewImportAction, runImportAction } from "../../admin-actions";
import { actionError } from "../../client";
import { IMPORT_COLUMNS, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "../../csv";

type Preview = NonNullable<Awaited<ReturnType<typeof previewImportAction>>["data"]>;
type Result = NonNullable<Awaited<ReturnType<typeof runImportAction>>["data"]>;

const ACTION_BADGE = {
  create: { label: "New", className: "bg-success/15 text-success" },
  update: { label: "Update", className: "bg-brand-sky/20 text-foreground" },
  skip: { label: "Already imported", className: "bg-muted text-muted-foreground" },
  error: { label: "Won't import", className: "bg-destructive/10 text-destructive" },
} as const;

/**
 * CSV import (replaces the Feeds importer): choose a file, preview what will
 * happen row by row, then import. Nothing is written until you confirm.
 */
export function CsvImport() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [publish, setPublish] = useState(true);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  function load(chosen: File | undefined) {
    if (!chosen) return;
    if (!/\.csv$/i.test(chosen.name) && chosen.type !== "text/csv") {
      toast.error("Choose a .csv file (in Excel or Google Sheets: File → Download → CSV).");
      return;
    }
    if (chosen.size > MAX_IMPORT_BYTES) {
      toast.error("That file is larger than 2 MB. Split it into smaller files.");
      return;
    }
    void chosen.text().then((text) => {
      setFile({ name: chosen.name, text });
      setResult(null);
      runPreview(text, updateExisting);
    });
  }

  function runPreview(text: string, update: boolean) {
    startTransition(async () => {
      const response = await previewImportAction({ csv: text, updateExisting: update, publish });
      const error = actionError(response);
      if (error || !response?.data) {
        setPreview(null);
        toast.error(error ?? "Couldn't read that file.");
        return;
      }
      setPreview(response.data);
    });
  }

  function runImport() {
    if (!file) return;
    startTransition(async () => {
      const response = await runImportAction({ csv: file.text, updateExisting, publish });
      const error = actionError(response);
      if (error || !response?.data) {
        toast.error(error ?? "The import failed.");
        return;
      }
      setResult(response.data);
      setPreview(null);
      toast.success(`Imported ${response.data.created + response.data.updated} resources`);
    });
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (input.current) input.current.value = "";
  }

  if (result) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
        <h2 className="mt-3 text-xl font-semibold">Import finished</h2>
        <p className="mt-1 text-muted-foreground">
          {result.created} new {result.created === 1 ? "resource" : "resources"}
          {result.updated ? `, ${result.updated} updated` : ""}.
        </p>
        {result.needsGeocode ? (
          <p className="mx-auto mt-3 flex max-w-lg items-start justify-center gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            {result.geocoding
              ? `${result.needsGeocode} ${result.needsGeocode === 1 ? "is" : "are"} being placed on the map${result.geocodeQueued ? " in the background" : ""}.`
              : `${result.needsGeocode} have no coordinates and geocoding isn't set up, so they won't appear in distance searches until you add a map pin.`}
          </p>
        ) : null}
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" onClick={reset}>
            <RotateCcw /> Import another file
          </Button>
          <Button asChild>
            <Link href="/admin/content/resources">See resources</Link>
          </Button>
        </div>
      </div>
    );
  }

  const rows = preview ? (onlyProblems ? preview.rows.filter((row) => row.errors.length || row.warnings.length) : preview.rows) : [];
  const importable = preview ? preview.counts.create + preview.counts.update : 0;

  return (
    <div className="grid gap-5">
      {!file ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              load(event.dataTransfer.files[0]);
            }}
            className={cn(
              "flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card p-8 text-center transition-colors hover:border-primary/50 hover:bg-secondary/40",
              dragging && "border-primary bg-secondary",
            )}
          >
            <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
              <Upload className="size-6" aria-hidden />
            </span>
            <span className="mt-4 font-heading text-lg font-semibold">Drop a CSV file here, or click to choose</span>
            <span className="mt-1 text-sm text-muted-foreground">
              Up to {MAX_IMPORT_ROWS.toLocaleString()} rows and 2 MB. You&apos;ll see a preview before anything is saved.
            </span>
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => load(event.target.files?.[0])} />
          </label>
          <div className="rounded-xl border bg-card p-5 text-sm">
            <h2 className="font-sans font-semibold">Columns we recognise</h2>
            <p className="mt-1 text-muted-foreground">The first row must hold the column names. Only &ldquo;Organization&rdquo; is required.</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {IMPORT_COLUMNS.map((column) => (
                <li key={column.field}>
                  <Badge variant={column.required ? "default" : "secondary"} className="font-normal">
                    {column.headers[0]}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-muted-foreground">
              Separate tags with semicolons. &ldquo;Serial No&rdquo; keeps re-imports from creating duplicates.
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <a href="/content/resources-import-template.csv" download>
                <Download /> Download template
              </a>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
          <FileSpreadsheet className="size-5 text-primary" aria-hidden />
          <span className="font-medium">{file.name}</span>
          {pending && !preview ? <Spinner /> : null}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>
            Choose another file
          </Button>
        </div>
      )}

      {preview ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="New" value={preview.counts.create} tone="success" />
            <Stat label="Updates" value={preview.counts.update} tone="sky" />
            <Stat label="Already imported (skipped)" value={preview.counts.skip} tone="muted" />
            <Stat label="Rows with errors" value={preview.counts.error} tone={preview.counts.error ? "destructive" : "muted"} />
          </div>

          {preview.unknownHeaders.length ? (
            <p className="flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              These columns will be ignored: {preview.unknownHeaders.map((header) => `“${header}”`).join(", ")}.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <Switch
                id="update-existing"
                checked={updateExisting}
                onCheckedChange={(value) => {
                  setUpdateExisting(value);
                  if (file) runPreview(file.text, value);
                }}
              />
              <Label htmlFor="update-existing">Update resources already imported (same Serial No)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="publish" checked={publish} onCheckedChange={setPublish} />
              <Label htmlFor="publish">Publish new resources right away</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="only-problems" checked={onlyProblems} onCheckedChange={setOnlyProblems} />
              <Label htmlFor="only-problems">Only show rows with issues ({preview.counts.error + preview.counts.warnings})</Label>
            </div>
          </div>

          <div className="max-h-[32rem] overflow-auto rounded-xl border bg-card">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-14">Line</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="hidden lg:table-cell">Tags</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const badge = ACTION_BADGE[row.action];
                  return (
                    <TableRow key={row.line}>
                      <TableCell className="text-muted-foreground tabular-nums">{row.line}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", badge.className)}>{badge.label}</span>
                      </TableCell>
                      <TableCell className="max-w-64 font-medium whitespace-normal">{row.title || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-sm">
                        {[row.city, row.state, row.zip].filter(Boolean).join(", ") || "—"}
                        {row.hasCoordinates ? <MapPin className="ml-1 inline size-3.5 text-success" aria-label="Has coordinates" /> : null}
                      </TableCell>
                      <TableCell className="hidden max-w-56 truncate text-sm text-muted-foreground lg:table-cell">{row.tags.join(", ")}</TableCell>
                      <TableCell className="max-w-80 text-sm whitespace-normal">
                        {row.errors.map((error) => (
                          <p key={error} className="flex items-start gap-1 text-destructive">
                            <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {error}
                          </p>
                        ))}
                        {row.warnings.map((warning) => (
                          <p key={warning} className="flex items-start gap-1 text-muted-foreground">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden /> {warning}
                          </p>
                        ))}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!rows.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No issues found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {!preview.geocoding ? (
              <p className="mr-auto text-sm text-muted-foreground">
                Geocoding isn&apos;t set up: rows without Latitude/Longitude won&apos;t appear in distance searches.
              </p>
            ) : null}
            <Button variant="outline" onClick={reset}>
              Cancel
            </Button>
            <Button onClick={runImport} disabled={pending || !importable} size="lg">
              {pending ? <Spinner /> : <Upload />}
              Import {importable} {importable === 1 ? "resource" : "resources"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "success" | "sky" | "muted" | "destructive" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p
        className={cn(
          "text-3xl font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
