import { ChevronRightIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { toast } from 'sonner';

import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SectionProps {
  readonly title: string;
  readonly children: ReactNode;
  /**
   * `row` lays specimens out side by side and is right for badges and buttons. `grid` is the
   * KPI row of §6 — equal columns, equal heights, gap 16 — which a wrapping flex row cannot give
   * (it sizes each card to its own content, so the one with sub-text ends up taller). `block`
   * is for a specimen that owns the full width and stacks internally: Tabs, Table.
   */
  readonly layout?: 'row' | 'grid' | 'block';
}

const SECTION_LAYOUTS = {
  row: 'flex flex-wrap items-start gap-3',
  grid: 'grid grid-cols-[repeat(3,minmax(0,220px))] items-stretch gap-4',
  block: 'w-full',
} as const;

// Local to this file on purpose: the kitchen sink is the one place that needs a repeated
// "titled group" wrapper, and it is not part of the design system Phase 2 ships.
function Section({ title, children, layout = 'row' }: SectionProps): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-card-title">{title}</h2>
      <div className={SECTION_LAYOUTS[layout]}>{children}</div>
    </section>
  );
}

/**
 * Phase 2's kitchen sink (frontend-plan.md task 2.6): every shadcn component task 2.3 installed,
 * every §4 status/tag/reason variant, both day-flag row tints, both role treatments, and
 * `StatCard`. Rendered directly from `App.tsx` because TanStack Router does not exist yet
 * (Phase 4) — this becomes the `dev.composants` route then, unchanged in substance.
 *
 * Demo values (the StatCard figures, the table rows) are illustrative, not fetched — Phase 3
 * wires the real endpoints. They are not a stand-in for the seed: nothing here claims to be seed
 * data. Labels are the verbatim French strings of direction-visuelle.md §4, hard-coded here
 * (`src/lib/labels.ts` is Phase 3.3); `StatusBadge` already keeps them in one map.
 */
export function KitchenSink(): ReactElement {
  return (
    <TooltipProvider>
      <div className="mx-auto flex max-w-[1360px] flex-col gap-8 px-6 py-8">
        <header className="flex flex-col gap-1">
          <p className="text-help">ERP · Maquette — usage interne, non navigable en production</p>
          <h1 className="text-page-title">Kitchen sink — design system</h1>
        </header>

        <Section title="StatCard" layout="grid">
          <StatCard label="€ facturable" value="12 400,00 €" />
          <StatCard label="Jours en retard" value="3" />
          <StatCard label="Cra" value="2" helpText="période 2026-06" />
        </Section>

        <Section title="StatusBadge — Cra">
          <StatusBadge variant="cra-draft" />
          <StatusBadge variant="cra-submitted" />
          <StatusBadge variant="cra-validated" />
          <StatusBadge variant="cra-refused" />
          <span className="inline-flex items-center gap-1.5">
            <StatusBadge variant="cra-submitted" />
            <StatusBadge variant="cra-late" />
          </span>
        </Section>

        <Section title="StatusBadge — Facture">
          <StatusBadge variant="invoice-draft" />
          <StatusBadge variant="invoice-issued" />
          <StatusBadge variant="invoice-cancelled" />
        </Section>

        <Section title="StatusBadge — Jours écartés (motif neutre vs. amber)">
          <StatusBadge variant="declined-not-regie" />
          <StatusBadge variant="declined-unknown-mission" />
          <StatusBadge variant="declined-no-agreed-rate" />
          <StatusBadge variant="declined-unknown-client" />
        </Section>

        {/* On a `--card` ground, not on the page: `--flag-weekend-bg` is `#f4f6f8`, the same value
            as `--background`, so a weekend row shown on the page ground is invisible and the
            specimen proves nothing. §4.4 tints a row inside the grid's table, and that table is
            white — this is the contrast the tint is actually designed against. */}
        <Section
          title="Flags de jour dans la grille (teinte de ligne, pas un badge)"
          layout="block"
        >
          <div className="w-96 overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-border">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm tabular-nums">12</span>
              <span className="text-xs text-muted-foreground">Jour ouvré</span>
            </div>
            <div className="flex items-center justify-between bg-flag-weekend-bg px-4 py-3">
              <span className="text-flag-weekend-text text-sm tabular-nums">13</span>
              <span className="text-flag-weekend-text text-xs">Week-end</span>
            </div>
            <div className="flex items-center justify-between bg-flag-holiday-bg px-4 py-3">
              <span className="text-flag-weekend-text text-sm tabular-nums">14</span>
              <span className="text-[11.5px] text-flag-holiday-text">Férié</span>
            </div>
          </div>
        </Section>

        <Section title="Rôles (§4.5) — accent sur le sélecteur, neutre partout ailleurs">
          <span className="inline-flex h-5 items-center rounded-4xl bg-accent px-2 text-xs font-medium text-accent-foreground">
            manager
          </span>
          <span className="inline-flex h-5 items-center rounded-4xl border border-border px-2 text-xs font-medium text-muted-foreground">
            manager
          </span>
        </Section>

        <Section title="Button">
          <Button>Enregistrer</Button>
          <Button variant="outline">Annuler</Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="ghost">Fantôme</Button>
          <Button variant="destructive">Supprimer</Button>
          <Button variant="link">Lien</Button>
          <Button disabled>Désactivé</Button>
        </Section>

        <Section title="Input, Label, Select, Checkbox">
          <div className="flex w-64 flex-col gap-1.5">
            <Label htmlFor="ks-input">Motif du refus</Label>
            <Input id="ks-input" placeholder="Saisir un motif…" />
          </div>
          <div className="flex w-64 flex-col gap-1.5">
            <Label htmlFor="ks-select">Bureau</Label>
            <Select defaultValue="paris">
              <SelectTrigger id="ks-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paris">Paris</SelectItem>
                <SelectItem value="lyon">Lyon</SelectItem>
                <SelectItem value="rennes">Rennes</SelectItem>
                <SelectItem value="bordeaux">Bordeaux</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="ks-checkbox" defaultChecked />
            <Label htmlFor="ks-checkbox">Inclure les Cra validés</Label>
          </div>
        </Section>

        <Section title="Card">
          <Card className="w-80">
            <CardHeader>
              <CardTitle>Claire Dubois</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Mission Réunion — TVA 8,5 %
            </CardContent>
          </Card>
        </Section>

        <Section title="Table" layout="block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Consultant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Demi-journées</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Alice Martin</TableCell>
                <TableCell>
                  <StatusBadge variant="cra-submitted" />
                </TableCell>
                <TableCell className="text-right tabular-nums">18</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Claire Dubois</TableCell>
                <TableCell>
                  <StatusBadge variant="cra-validated" />
                </TableCell>
                <TableCell className="text-right tabular-nums">20</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>

        <Section title="Tabs" layout="block">
          <Tabs defaultValue="a-facturer" className="w-full">
            <TabsList>
              <TabsTrigger value="a-facturer">À facturer</TabsTrigger>
              <TabsTrigger value="emises">Émises</TabsTrigger>
            </TabsList>
            <TabsContent value="a-facturer" className="text-sm text-muted-foreground">
              Aucune facture brouillon.
            </TabsContent>
            <TabsContent value="emises" className="text-sm text-muted-foreground">
              Aucune facture émise.
            </TabsContent>
          </Tabs>
        </Section>

        <Section title="Dialog, AlertDialog, Sheet">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Ouvrir un dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Résultat de la validation</DialogTitle>
                <DialogDescription>Une facture brouillon a été créée.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button>Fermer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Ouvrir une alerte</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmer le refus ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Le consultant verra le motif sur son mois.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction>Refuser</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Ouvrir un sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filtres</SheetTitle>
                <SheetDescription>Filtrer la liste par statut.</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
        </Section>

        <Section title="DropdownMenu, Popover, Tooltip">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Voir le détail</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">Refuser</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Ouvrir un popover</Button>
            </PopoverTrigger>
            <PopoverContent>Contenu du popover.</PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">
                <PlusIcon />
                Survoler
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ajouter une ligne</TooltipContent>
          </Tooltip>
        </Section>

        <Section title="Avatar, Badge, Separator">
          <Avatar>
            <AvatarFallback>BL</AvatarFallback>
          </Avatar>
          <Badge>Défaut</Badge>
          <Badge variant="secondary">Secondaire</Badge>
          <Badge variant="outline">Contour</Badge>
          <Separator orientation="vertical" className="h-6" />
          <span className="text-sm text-muted-foreground">Séparateur vertical à gauche</span>
        </Section>

        <Section title="Skeleton">
          <div className="flex w-64 flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </Section>

        <Section title="Sonner (Toaster)">
          <Button variant="outline" onClick={() => toast('Cra enregistré.')}>
            Déclencher un toast
          </Button>
          <Toaster />
        </Section>

        <Section title="ScrollArea">
          <ScrollArea className="h-32 w-64 rounded-lg border border-border">
            <ul className="flex flex-col gap-2 p-3 text-sm">
              <li>Audit — Paris</li>
              <li>SOC — Paris</li>
              <li>GRC — Lyon</li>
              <li>IAM — Rennes</li>
              <li>Sécurité offensive — Bordeaux</li>
            </ul>
          </ScrollArea>
        </Section>

        <Section title="Breadcrumb">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/tableau-de-bord">Accueil</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRightIcon className="size-3.5" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>Pré-facturier</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Section>

        <Section title="Alert">
          <Alert className="w-96">
            <AlertTitle>Mois refusé</AlertTitle>
            <AlertDescription>Motif : jours saisis hors période.</AlertDescription>
            <AlertAction>
              <Button size="sm" variant="outline">
                Voir
              </Button>
            </AlertAction>
          </Alert>
        </Section>

        <Section title="Collapsible">
          <Collapsible className="w-72">
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                Motifs bloquants (3)
                <ChevronRightIcon className="size-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 text-sm text-muted-foreground">
              Mission inconnue de la facturation
            </CollapsibleContent>
          </Collapsible>
        </Section>
      </div>
    </TooltipProvider>
  );
}
