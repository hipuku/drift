import { faTableColumns, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState, type ReactNode } from "react";
import { Text } from "../components/Text/Text.js";
import { Foundation } from "../foundation/Foundation.js";
import { Configure } from "../screens/Configure/Configure.js";
import { ProductShell } from "../shell/ProductShell.js";
import styles from "./DevHarness.module.css";

interface HarnessState {
  id: string;
  label: string;
  render: (key: number) => ReactNode;
}

const STATES: HarnessState[] = [
  { id: "configure", label: "Configure", render: (key) => <Configure key={key} /> },
  { id: "foundation", label: "Foundation", render: () => <Foundation /> },
];

/**
 * Internal harness — a dev-only drawer for viewing each state in isolation,
 * opened from the top bar. Not mounted in production; the product is just the
 * ProductShell + the active flow.
 */
export function DevHarness() {
  const [activeId, setActiveId] = useState(STATES[0]!.id);
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const current = STATES.find((s) => s.id === activeId) ?? STATES[0]!;

  const opener = (
    <button
      type="button"
      className={styles.opener}
      onClick={() => setOpen(true)}
      aria-label="Open states harness"
      aria-expanded={open}
    >
      <FontAwesomeIcon icon={faTableColumns} />
    </button>
  );

  return (
    <>
      <ProductShell onHome={() => setResetKey((k) => k + 1)} trailing={opener}>
        {current.render(resetKey)}
      </ProductShell>

      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        className={open ? `${styles.drawer} ${styles.drawerOpen}` : styles.drawer}
        aria-hidden={!open}
      >
        <div className={styles.head}>
          <Text role="label-xs" className={styles.title}>
            Internal harness
          </Text>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <Text role="label-xs" as="p" className={styles.group}>
          States
        </Text>
        <ul className={styles.list}>
          {STATES.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={s.id === activeId ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
                aria-current={s.id === activeId}
                onClick={() => {
                  setActiveId(s.id);
                  setOpen(false);
                }}
              >
                <Text role="label">{s.label}</Text>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
