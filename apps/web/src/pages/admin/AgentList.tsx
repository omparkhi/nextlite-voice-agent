import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import type { Agent } from '../../types';

const statusColors: Record<string, string> = {
  DRAFT: '#a8a29e',
  READY: '#16a34a',
  LIVE: '#16a34a',
  PAUSED: '#d97706',
  ARCHIVED: '#777169',
};

export function AgentList() {
  const { clientId } = useParams<{ clientId: string }>();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    api.getAgents(clientId).then((data) => {
      setAgents(data);
      setLoading(false);
    });
  }, [clientId]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-10">
        <h1 className="font-display-serif text-3xl text-stone-900">
          Agents
        </h1>
        <Link
          to={`/admin/clients/${clientId}/agents/new`}
          className="el-btn-primary"
        >
          Create Agent
        </Link>
      </div>

      {loading ? (
        <div className="text-stone-500 text-center py-20">Loading...</div>
      ) : agents.length === 0 ? (
        <div className="el-card flex flex-col items-center justify-center py-20">
          <p className="text-stone-500 text-lg mb-4">No agents yet</p>
          <Link
            to={`/admin/clients/${clientId}/agents/new`}
            className="el-btn-primary"
          >
            Create your first agent
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              to={`/admin/clients/${clientId}/agents/${agent.id}`}
              className="el-card block hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-display-serif text-xl text-stone-900">
                  {agent.name}
                </h2>
                <span
                  className="el-badge"
                  style={{
                    backgroundColor: statusColors[agent.status] ?? '#a8a29e',
                    color: '#fff',
                  }}
                >
                  {agent.status}
                </span>
              </div>
              <div className="space-y-1 text-sm text-stone-600">
                {agent.template?.name && (
                  <p>
                    <span className="text-stone-400">Template:</span>{' '}
                    {agent.template.name}
                  </p>
                )}
                {agent.template?.industry && (
                  <p>
                    <span className="text-stone-400">Industry:</span>{' '}
                    {agent.template.industry}
                  </p>
                )}
                {agent.updatedAt && (
                  <p className="text-stone-400 text-xs pt-2">
                    Updated {new Date(agent.updatedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
