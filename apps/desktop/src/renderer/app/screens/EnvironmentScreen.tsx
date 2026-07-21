import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { Environment, EnvironmentVariable } from "@openapi-collection-studio/core";
import { KeyValueEditor } from "../../components/KeyValueEditor";
import { createEnvironmentVariable, environmentBaseUrl, isBaseUrlVariable, replaceEnvironmentCustomVariables } from "../helpers";

export function EnvironmentScreen({
  environments,
  activeEnvironmentId,
  onSelectEnvironment,
  onCreateEnvironment,
  onDeleteEnvironment,
  onUpdateEnvironmentBaseUrl,
  onUpdateEnvironment
}: {
  environments: Environment[];
  activeEnvironmentId?: string;
  onSelectEnvironment(environmentId: string): void;
  onCreateEnvironment(): void;
  onDeleteEnvironment(environmentId: string): void;
  onUpdateEnvironmentBaseUrl(environmentId: string, value: string): boolean;
  onUpdateEnvironment(environmentId: string, recipe: (environment: Environment) => void): void;
}) {
  const active = environments.find((environment) => environment.id === activeEnvironmentId) ?? environments[0];
  const currentBaseUrl = active ? environmentBaseUrl(active) : "";
  const [baseUrlDraft, setBaseUrlDraft] = useState(currentBaseUrl);
  const customVariables = active?.variables.filter((variable) => !isBaseUrlVariable(variable)) ?? [];
  useEffect(() => {
    setBaseUrlDraft(currentBaseUrl);
  }, [active?.id, currentBaseUrl]);

  const commitBaseUrl = () => {
    if (!active) {
      return;
    }
    if (baseUrlDraft.trim() === currentBaseUrl.trim()) {
      setBaseUrlDraft(currentBaseUrl);
      return;
    }
    const accepted = onUpdateEnvironmentBaseUrl(active.id, baseUrlDraft);
    if (!accepted) {
      setBaseUrlDraft(currentBaseUrl);
    }
  };

  return (
    <section className="environment-layout">
      <aside className="side-panel">
        <div className="pane__header">
          <h2>Connection profiles</h2>
          <button className="icon-button" onClick={onCreateEnvironment} title="New environment" type="button">
            <Plus size={16} />
          </button>
        </div>
        {environments.map((environment) => (
          <button
            className={environment.id === active?.id ? "list-button is-active" : "list-button"}
            key={environment.id}
            onClick={() => onSelectEnvironment(environment.id)}
            type="button"
          >
            {environment.name}
          </button>
        ))}
      </aside>
      <div className="pane">
        {active ? (
          <>
            <div className="pane__header">
              <input
                aria-label="Environment name"
                className="title-input"
                onBlur={() =>
                  onUpdateEnvironment(active.id, (environment) => {
                    environment.name = environment.name.trim() || "Environment";
                  })
                }
                onChange={(event) =>
                  onUpdateEnvironment(active.id, (environment) => {
                    environment.name = event.target.value;
                  })
                }
                value={active.name}
              />
              <button
                className="secondary-button"
                disabled={environments.length <= 1}
                onClick={() => onDeleteEnvironment(active.id)}
                title={environments.length <= 1 ? "At least one environment is required" : "Delete environment"}
                type="button"
              >
                Delete
              </button>
            </div>
            <p className="connection-profile-help">
              A named profile keeps a base URL and variables together. Switch profiles from the top bar without changing your collections.
            </p>
            <label className="field environment-base-url">
              <span>Environment base URL</span>
              <input
                aria-label="Environment base URL"
                onBlur={commitBaseUrl}
                onChange={(event) => setBaseUrlDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    setBaseUrlDraft(currentBaseUrl);
                  }
                }}
                placeholder="https://api.example.com"
                value={baseUrlDraft}
              />
            </label>
            <EnvironmentVariableEditor
              variables={customVariables}
              onChange={(variables) =>
                onUpdateEnvironment(active.id, (environment) => {
                  replaceEnvironmentCustomVariables(environment, variables);
                })
              }
            />
          </>
        ) : (
          <div className="empty-state">
            <h2>No environment yet</h2>
            <button className="primary-button" onClick={onCreateEnvironment} type="button">
              <Plus size={16} />
              Create environment
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export function EnvironmentVariableEditor({
  variables,
  onChange
}: {
  variables: EnvironmentVariable[];
  onChange(variables: EnvironmentVariable[]): void;
}) {
  const update = (id: string, patch: Partial<EnvironmentVariable>) => {
    onChange(variables.map((variable) => (variable.id === id ? { ...variable, ...patch } : variable)));
  };

  return (
    <div className="env-table">
      <div className="env-table__head">
        <span>Enabled</span>
        <span>Name</span>
        <span>Value</span>
        <span>Secret</span>
        <span />
      </div>
      {variables.map((variable) => (
        <div className="env-table__row" key={variable.id}>
          <input
            checked={variable.enabled}
            onChange={(event) => update(variable.id, { enabled: event.target.checked })}
            type="checkbox"
          />
          <input
            onChange={(event) => update(variable.id, { name: event.target.value })}
            value={variable.name}
          />
          <input
            onChange={(event) => update(variable.id, { value: event.target.value })}
            type={variable.secret ? "password" : "text"}
            value={variable.value}
          />
          <input
            checked={Boolean(variable.secret)}
            onChange={(event) => update(variable.id, { secret: event.target.checked })}
            type="checkbox"
          />
          <button
            className="icon-button"
            onClick={() => onChange(variables.filter((candidate) => candidate.id !== variable.id))}
            title="Remove variable"
            type="button"
          >
            x
          </button>
        </div>
      ))}
      <button
        className="secondary-button"
        onClick={() => onChange([...variables, createEnvironmentVariable("", "")])}
        type="button"
      >
        <Plus size={16} />
        Add variable
      </button>
    </div>
  );
}
