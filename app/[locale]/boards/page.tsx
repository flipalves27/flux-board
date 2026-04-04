import BoardsPage from "../../(workspace)/boards/page";

/** Suspense em volta da página inteira mantinha o skeleton preso enquanto `useSearchParams` suspendia; o sync de query fica isolado dentro de `BoardsPage`. */
export default function Page() {
  return <BoardsPage />;
}
