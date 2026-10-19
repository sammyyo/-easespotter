import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Condition = {
  field: string;
  operator: string;
  value: string | number;
  id: string;
};

const fieldOptions = [
  { value: 'category', label: 'Category' },
  { value: 'currentPrice', label: 'Current Price' },
  { value: 'basePrice', label: 'Base Price' },
  { value: 'stock', label: 'Stock Level' },
  { value: 'lowStockThreshold', label: 'Low Stock Threshold' },
  { value: 'reorderPoint', label: 'Reorder Point' },
  { value: 'inventoryStatus', label: 'Inventory Status' },
  { value: 'daysSinceRestocked', label: 'Days Since Restock' },
  { value: 'product', label: 'Product Name' },
  { value: 'sku', label: 'SKU' },
  { value: 'aisle', label: 'Aisle' },
  { value: 'shelf', label: 'Shelf' },
  { value: 'lastRestocked', label: 'Last Restocked' },
  { value: 'lastUpdated', label: 'Last Updated' },
  { value: 'competitorPrice', label: 'Competitor Price' },
];

const inventoryStatusOptions = [
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'in_stock', label: 'In Stock' },
  { value: 'overstocked', label: 'Overstocked' },
];

const operatorOptions = [
  { value: 'equals', label: 'Equals', types: ['string', 'number'] },
  { value: 'notEquals', label: 'Not Equals', types: ['string', 'number'] },
  { value: 'contains', label: 'Contains', types: ['string'] },
  { value: 'greaterThan', label: '>', types: ['number', 'date'] },
  { value: 'lessThan', label: '<', types: ['number', 'date'] },
  { value: 'greaterThanOrEqual', label: '≥', types: ['number', 'date'] },
  { value: 'lessThanOrEqual', label: '≤', types: ['number', 'date'] },
  { value: 'between', label: 'Between', types: ['number', 'date'] },
  { value: 'in', label: 'In List', types: ['string', 'number'] },
];

// Determine field data type for selecting appropriate operators
const getFieldType = (field: string): 'string' | 'number' | 'date' => {
  if ([
    'currentPrice',
    'basePrice',
    'stock',
    'lowStockThreshold',
    'reorderPoint',
    'daysSinceRestocked',
    'competitorPrice',
  ].includes(field)) {
    return 'number';
  } else if (['lastUpdated', 'lastRestocked'].includes(field)) {
    return 'date';
  }
  return 'string';
};

// Filter operators based on field type
const getValidOperators = (field: string) => {
  const fieldType = getFieldType(field);
  return operatorOptions.filter(op => op.types.includes(fieldType));
};

interface ConditionBuilderProps {
  value?: Record<string, unknown>;
  onChange: (conditions: Record<string, unknown>) => void;
}

export function ConditionBuilder({ value = {}, onChange }: ConditionBuilderProps) {
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Convert initial value object to conditions array on component mount
    try {
      const initialConditions = Object.entries(value).map(([field, details], index) => {
        if (typeof details === 'object' && details !== null) {
          const entry = details as Record<string, any>;
          const operator = Object.keys(entry)[0];
          const value = entry[operator];
          return {
            field,
            operator,
            value,
            id: `condition-${index}`,
          };
        }
        return {
          field,
          operator: 'equals',
          value: details,
          id: `condition-${index}`,
        };
      });
      
      if (initialConditions.length > 0) {
        setConditions(initialConditions);
      }
    } catch (err) {
      console.error('Error parsing conditions:', err);
    }
  }, []);

  useEffect(() => {
    // Convert conditions array to object when conditions change
    try {
      const conditionsObj: Record<string, unknown> = {};
      
      conditions.forEach(condition => {
        if (condition.field && condition.operator) {
          if ([
            'currentPrice',
            'basePrice',
            'stock',
            'lowStockThreshold',
            'reorderPoint',
            'daysSinceRestocked',
            'competitorPrice',
          ].includes(condition.field)) {
            // Convert numeric values
            const numValue = Number(condition.value);
            if (!isNaN(numValue)) {
              if (['equals', 'notEquals', 'in'].includes(condition.operator)) {
                conditionsObj[condition.field] = { [condition.operator]: numValue };
              } else {
                conditionsObj[condition.field] = { [condition.operator]: numValue };
              }
            } else {
              setError(`Invalid number for ${condition.field}`);
            }
          } else if (condition.field === 'lastUpdated') {
            // Handle date values
            conditionsObj[condition.field] = { [condition.operator]: condition.value };
          } else {
            // Handle string values
            conditionsObj[condition.field] = { [condition.operator]: condition.value };
          }
        }
      });
      
      setError(null);
      
      // Prevent recursive updates by comparing deep equality
      const currentConditionsStr = JSON.stringify(conditionsObj);
      const previousConditionsStr = JSON.stringify(value);
      
      if (currentConditionsStr !== previousConditionsStr) {
        onChange(conditionsObj);
      }
    } catch (err) {
      console.error('Error generating conditions object:', err);
      setError('Failed to generate conditions. Check your inputs.');
    }
  }, [conditions]);

  const addCondition = () => {
    const newCondition: Condition = {
      field: 'stock',
      operator: 'lessThanOrEqual',
      value: '',
      id: `condition-${Date.now()}`,
    };
    setConditions([...conditions, newCondition]);
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const updateCondition = (id: string, field: keyof Condition, value: string | number) => {
    setConditions(conditions.map(c => {
      if (c.id === id) {
        const updatedCondition = { ...c, [field]: value };
        
        // Reset operator if field type changed
        if (field === 'field') {
          const validOperators = getValidOperators(value as string);
          updatedCondition.operator = validOperators[0]?.value || 'equals';
          updatedCondition.value = value === 'inventoryStatus' ? 'low_stock' : '';
        }
        
        return updatedCondition;
      }
      return c;
    }));
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {conditions.length === 0 ? (
        <div className="text-center p-4 border rounded-lg border-dashed">
          <p className="text-muted-foreground">No conditions added yet. Add a condition to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {conditions.map((condition) => (
            <div key={condition.id} className="grid grid-cols-12 gap-2 items-center border p-3 rounded-md">
              <div className="col-span-3">
                <Label htmlFor={`field-${condition.id}`} className="sr-only">Field</Label>
                <Select
                  value={condition.field}
                  onValueChange={(value) => updateCondition(condition.id, 'field', value)}
                >
                  <SelectTrigger id={`field-${condition.id}`}>
                    <SelectValue placeholder="Select Field" />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="col-span-3">
                <Label htmlFor={`operator-${condition.id}`} className="sr-only">Operator</Label>
                <Select
                  value={condition.operator}
                  onValueChange={(value) => updateCondition(condition.id, 'operator', value)}
                >
                  <SelectTrigger id={`operator-${condition.id}`}>
                    <SelectValue placeholder="Select Operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {getValidOperators(condition.field).map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="col-span-5">
                <Label htmlFor={`value-${condition.id}`} className="sr-only">Value</Label>
                {condition.field === 'inventoryStatus' ? (
                  <Select
                    value={String(condition.value || 'low_stock')}
                    onValueChange={(value) => updateCondition(condition.id, 'value', value)}
                  >
                    <SelectTrigger id={`value-${condition.id}`}>
                      <SelectValue placeholder="Select inventory status" />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryStatusOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`value-${condition.id}`}
                    value={condition.value}
                    onChange={(e) => updateCondition(condition.id, 'value', e.target.value)}
                    type={getFieldType(condition.field) === 'number' ? 'number' : getFieldType(condition.field) === 'date' ? 'date' : 'text'}
                    placeholder={
                      condition.field === 'daysSinceRestocked'
                        ? 'Enter number of days'
                        : `Enter ${getFieldType(condition.field)} value`
                    }
                  />
                )}
              </div>
              
              <div className="col-span-1 text-right">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => removeCondition(condition.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <Button 
        type="button" 
        variant="outline" 
        onClick={addCondition}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Condition
      </Button>
      
      {conditions.length > 0 && (
        <div className="mt-4">
          <Label>Active Conditions</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {conditions.map((condition) => {
              const fieldLabel = fieldOptions.find(f => f.value === condition.field)?.label || condition.field;
              const operatorLabel = operatorOptions.find(o => o.value === condition.operator)?.label || condition.operator;
              
              return (
                <Badge key={condition.id} variant="outline">
                  {fieldLabel} {operatorLabel} {condition.value}
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
