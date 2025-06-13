import React from 'react';
import { ContainerState } from '../../../shared/src/models';

interface ContainerStatusBadgeProps {
  state: ContainerState;
}

const ContainerStatusBadge: React.FC<ContainerStatusBadgeProps> = ({ state }) => {
  const getStatusConfig = (state: ContainerState): { 
    bgColor: string; 
    textColor: string;
    label: string;
  } => {
    switch (state) {
      case ContainerState.RUNNING:
        return {
          bgColor: 'bg-green-100',
          textColor: 'text-green-800',
          label: 'Running'
        };
      case ContainerState.STOPPED:
        return {
          bgColor: 'bg-red-100',
          textColor: 'text-red-800',
          label: 'Stopped'
        };
      case ContainerState.PAUSED:
        return {
          bgColor: 'bg-yellow-100',
          textColor: 'text-yellow-800',
          label: 'Paused'
        };
      case ContainerState.RESTARTING:
        return {
          bgColor: 'bg-blue-100',
          textColor: 'text-blue-800',
          label: 'Restarting'
        };
      case ContainerState.REMOVING:
        return {
          bgColor: 'bg-purple-100',
          textColor: 'text-purple-800',
          label: 'Removing'
        };
      case ContainerState.DEAD:
        return {
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          label: 'Dead'
        };
      case ContainerState.CREATED:
        return {
          bgColor: 'bg-indigo-100',
          textColor: 'text-indigo-800',
          label: 'Created'
        };
      default:
        return {
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          label: state
        };
    }
  };

  const { bgColor, textColor, label } = getStatusConfig(state);

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bgColor} ${textColor}`}>
      <span className={`h-2 w-2 rounded-full ${bgColor.replace('100', '400')} mr-1.5`}></span>
      {label}
    </span>
  );
};

export default ContainerStatusBadge;