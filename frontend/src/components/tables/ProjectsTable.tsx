import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Download } from "lucide-react";
import { useMemo } from "react";

import type { ProjectRow } from "../../api/types";
import { compactText, formatMoney } from "../../lib/formatters";

const columnHelper = createColumnHelper<ProjectRow>();

export function ProjectsTable({ items }: { items: ProjectRow[] }) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("organization_name", { header: "Foundation" }),
      columnHelper.accessor("country", { header: "Recipient" }),
      columnHelper.accessor("year", { header: "Year" }),
      columnHelper.accessor("sector_description_primary", { header: "Sector" }),
      columnHelper.accessor("grant_recipient_project_title", {
        header: "Project",
        cell: (info) => compactText(info.getValue() ?? "Untitled project", 80),
      }),
      columnHelper.accessor("amount", {
        header: "Amount",
        cell: (info) => formatMoney(info.getValue()),
      }),
    ],
    [],
  );
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() });

  function exportCsv() {
    const header = columns.map((column) => String(column.header)).join(",");
    const rows = items.map((item) =>
      [
        item.organization_name,
        item.country,
        item.year,
        item.sector_description_primary,
        item.grant_recipient_project_title,
        item.amount,
      ]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "oecd-filtered-projects.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="table-shell">
      <div className="table-toolbar">
        <span>{items.length} visible rows</span>
        <button onClick={exportCsv}>
          <Download size={16} /> Export CSV
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
