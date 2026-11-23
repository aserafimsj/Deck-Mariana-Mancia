"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function RetryButton() {
  const router = useRouter();
  return (
    <Button block onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>
      Tentar de novo
    </Button>
  );
}
